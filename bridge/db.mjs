// Reading Linked Helper's own database.
//
// LH2 keeps one SQLite file per logged-in LinkedIn account:
//
//   ~/Library/Application Support/linked-helper/
//     Partitions/linked-helper-account-<id>-main/lh.db
//
// This is a far better source than its screen. The account manager rewrites a
// licence as "14 days" or "Aug 9, 2026" depending on mood, and its setup wizard
// drifts in and out of the DOM — the database just has rows.
//
// Two rules hold here:
//
//   Read only. Opened with readOnly, never written, never migrated. Campaign
//   control goes through LH2 itself over IPC, because writing behind a running
//   app's back is how you corrupt its state.
//
//   No person data. The schema has ~40 person_* tables of third-party LinkedIn
//   profiles — names, employers, phone numbers, birthdays. The console has no
//   need for any of it, so nothing here selects from them. Counts only.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LH_HOME =
  process.env.STRIDE_LH_HOME ||
  path.join(os.homedir(), "Library", "Application Support", "linked-helper");

const PARTITION = /^linked-helper-account-(\d+)-main$/;

export class DbUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = "DbUnavailable";
  }
}

/** Every logged-in account's database, newest partition first. */
export function findAccountDbs(home = LH_HOME) {
  const partitions = path.join(home, "Partitions");
  let entries;
  try {
    entries = fs.readdirSync(partitions, { withFileTypes: true });
  } catch {
    throw new DbUnavailable(
      `No Linked Helper profile at ${partitions}. The app has never run on this Mac, or its data lives elsewhere.`,
    );
  }

  const found = [];
  for (const entry of entries) {
    const match = entry.isDirectory() && entry.name.match(PARTITION);
    if (!match) continue;
    const file = path.join(partitions, entry.name, "lh.db");
    if (fs.existsSync(file)) found.push({ partitionAccountId: match[1], file });
  }
  return found;
}

function open(file) {
  try {
    return new DatabaseSync(file, { readOnly: true });
  } catch (err) {
    throw new DbUnavailable(`Could not open ${path.basename(file)} read-only: ${err.message}`);
  }
}

function all(db, sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch {
    // A schema that moved under us is a missing section, not a dead endpoint.
    return [];
  }
}

function one(db, sql, params = []) {
  return all(db, sql, params)[0] ?? null;
}

/**
 * LH2's campaign type codes. Only the ones actually seen are named; anything
 * else is reported by number rather than guessed at.
 */
const CAMPAIGN_TYPES = { 1: "Collect" };

/** Paused/archived/valid flags collapsed into the one word a person wants. */
function campaignState(row) {
  if (row.is_archived) return "archived";
  if (!row.is_valid) return "invalid";
  if (row.is_paused) return "paused";
  return "running";
}

/** Everything the console shows for one account, from its database. */
function readAccountDb(file, partitionAccountId) {
  const db = open(file);
  try {
    const account = one(
      db,
      "SELECT id, external_id, full_name, email, last_login_at FROM li_accounts LIMIT 1",
    );

    const campaigns = all(
      db,
      `SELECT id, uuid, name, description, type, is_paused, is_archived, is_valid,
              is_hidden, created_at
         FROM campaigns
        WHERE is_hidden = 0
        ORDER BY created_at DESC`,
    ).map((row) => {
      /* Each step, with what it actually does and whether it is armed.
       * isDraft is the field that matters: Linked Helper will not run a step
       * still marked draft, which is why a "running" campaign can sit there
       * doing only its first action. Showing the type without that flag would
       * imply the whole sequence is live when it is not. */
      const steps = all(
        db,
        `SELECT a.id,
                MAX(ca.action_name) AS action_name,
                MAX(ac.actionType)  AS action_type,
                MIN(ac.isDraft)     AS is_draft
           FROM actions a
           LEFT JOIN campaign_actions ca ON ca.action_id = a.id
           LEFT JOIN action_versions av  ON av.action_id = a.id
           LEFT JOIN action_configs ac   ON ac.id = av.config_id
          WHERE a.campaign_id = ?
          GROUP BY a.id
          ORDER BY a.id`,
        [row.id],
      ).map((s) => ({
        name: s.action_name || null,
        type: s.action_type || null,
        armed: s.is_draft === 0,
      }));
      // How many profiles this campaign is working on. NOT collection_people —
      // LH2 leaves that table empty and files the real thing under the actions,
      // which is how the console came to report 0 against 870 real profiles.
      const people =
        one(
          db,
          `SELECT COUNT(DISTINCT atp.person_id) AS n
             FROM action_target_people atp
             JOIN actions a ON a.id = atp.action_id
            WHERE a.campaign_id = ?`,
          [row.id],
        )?.n ?? 0;

      return {
        id: row.id,
        uuid: row.uuid,
        name: row.name || "(unnamed campaign)",
        description: row.description || null,
        type: CAMPAIGN_TYPES[row.type] ?? `type ${row.type}`,
        state: campaignState(row),
        createdAt: row.created_at,
        stepCount: steps.length,
        armedSteps: steps.filter((s) => s.armed).length,
        people,
        steps,
      };
    });

    // Aggregates only — never a row out of the person tables.
    const peopleCollected = one(db, "SELECT COUNT(*) AS n FROM people")?.n ?? 0;
    const dailyMax = one(db, "SELECT max_limit AS n FROM daily_limits LIMIT 1")?.n ?? null;

    const usedToday = one(
      db,
      `SELECT COALESCE(SUM(credits_used), 0) AS n
         FROM limit_type_credits_used
        WHERE DATE(created_at) = DATE('now')`,
    )?.n;

    return {
      account: account
        ? {
            id: account.id,
            externalId: account.external_id,
            name: account.full_name,
            email: account.email,
            lastLoginAt: account.last_login_at,
          }
        : { id: null, externalId: partitionAccountId, name: null, email: null, lastLoginAt: null },
      campaigns,
      peopleCollected,
      dailyMax,
      usedToday: typeof usedToday === "number" ? usedToday : null,
    };
  } finally {
    db.close();
  }
}

/**
 * Campaigns across every logged-in account. Throws DbUnavailable only when no
 * database can be found at all; one unreadable account is reported in place so
 * a second healthy account still shows.
 */
/**
 * The messages Linked Helper's AI has written, waiting to be approved.
 *
 * This is the one place the console deliberately reads person rows. Everywhere
 * else takes counts, because the schema is full of third-party profile data we
 * have no business holding. Here the whole point is a founder reading what is
 * about to be sent in their name, so the person's name and headline come with
 * the text. It goes no further than this Mac.
 *
 * LH2 writes each message as a custom field on the person, named by the
 * `outputFieldName` in the campaign's AIPersonalizedMessages config, e.g.
 * "ai_message_1". Nothing else in the schema holds the draft.
 */
export function readAiDrafts({ limit = 200 } = {}) {
  const dbs = findAccountDbs();
  const drafts = [];

  for (const { file } of dbs) {
    const db = open(file);
    try {
      const rows = all(
        db,
        `SELECT pcf.id, pcf.person_id, pcf.campaign_id, pcf.field_name, pcf.field_content,
                pcf.updated_at, c.name AS campaign_name,
                pmp.first_name, pmp.last_name, pmp.headline
           FROM person_custom_fields pcf
           LEFT JOIN campaigns c ON c.id = pcf.campaign_id
           LEFT JOIN person_mini_profile pmp ON pmp.id = pcf.person_id
          WHERE pcf.field_name LIKE 'ai\\_%' ESCAPE '\\'
            AND LENGTH(TRIM(pcf.field_content)) > 0
          ORDER BY pcf.updated_at DESC
          LIMIT ?`,
        [limit],
      );

      for (const row of rows) {
        drafts.push({
          id: `${row.campaign_id ?? 0}:${row.person_id}:${row.field_name}`,
          personId: row.person_id,
          campaignId: row.campaign_id,
          campaignName: row.campaign_name ?? null,
          field: row.field_name,
          text: row.field_content,
          name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
          headline: row.headline ?? null,
          updatedAt: row.updated_at,
        });
      }
    } catch {
      // A schema that moved is a missing section, not a dead endpoint.
    } finally {
      db.close();
    }
  }

  return { drafts, at: new Date().toISOString() };
}

/**
 * How many real people starting this account's runner would begin messaging.
 *
 * Only unpaused campaigns count: a paused one does not send when the runner
 * starts. This is the number the console refuses on, so it is kept separate
 * from the endpoint that uses it and tested on its own.
 */
export function audienceAtRisk(view, email) {
  const armed = (view?.accounts ?? [])
    .filter((a) => !email || a.account?.email === email)
    .flatMap((a) => a.campaigns ?? [])
    .filter((c) => c.state === "running");
  return {
    campaigns: armed.map((c) => ({ name: c.name, people: c.people ?? 0 })),
    reach: armed.reduce((n, c) => n + (c.people ?? 0), 0),
  };
}

export function readCampaigns() {
  const dbs = findAccountDbs();
  if (dbs.length === 0) {
    throw new DbUnavailable(
      "Linked Helper has no logged-in LinkedIn account on this Mac, so there is no campaign database yet.",
    );
  }

  const accounts = [];
  for (const { file, partitionAccountId } of dbs) {
    try {
      accounts.push({ ...readAccountDb(file, partitionAccountId), error: null });
    } catch (err) {
      accounts.push({
        account: { id: null, externalId: partitionAccountId, name: null, email: null, lastLoginAt: null },
        campaigns: [],
        peopleCollected: 0,
        dailyMax: null,
        usedToday: null,
        error: err.message,
      });
    }
  }

  return {
    accounts,
    campaignCount: accounts.reduce((n, a) => n + a.campaigns.length, 0),
    at: new Date().toISOString(),
  };
}
