// Linked Helper channel tests.
//
// Two things are worth guarding here. First, the account-screen parser: it is
// the one piece that reads LH2's rendered UI, LH2 auto-updates, and when its
// markup moves this is what breaks. The fixture below is real text captured
// from Linked Helper 2.122.19 on 2026-07-26.
//
// Second, the bridge's front door. It can drive a real LinkedIn account, so an
// unauthenticated caller must never get past it.
//
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { parseAccountScreen } from "../bridge/lh.mjs";
import { findAccountDbs, DbUnavailable } from "../bridge/db.mjs";

const REPO = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

// Captured verbatim from the running app.
const ACCOUNT_SCREEN = `ACCOUNT MANAGER
First steps to get started
Step 1: You've connected your LinkedIn account
Step 2: You paused at "Create your first campaign"
Click on "" to run your LinkedIn account and continue setup
Personal workspace
ID: 531684
Workspace Management
LinkedIn Accounts
Required
Licenses
Billing
Proxies
Get free license
Notifications
2
Settings
Need help?
Knowledge base
Sarvesh Singh
sarveshsingh740@gmail.com
LinkedIn accounts
All
Running
Stopped
In use
Archived
Add account
Buy license
LinkedIn account
State
Access
License
Archived
jort.hubers@gmail.com
Jort Hubers
Show password
Details
Stopped
Owner
14 days
Pro
No
sarveshsingh7400@gmail.com
not logged in
Show password
Details
-
Owner
No
10
rows`;

// The same screen once the account is in use. Linked Helper switches the
// licence column from a countdown to an absolute date and the state to
// "Collecting" — which is exactly what broke the first version of the parser.
const IN_USE_SCREEN = `ACCOUNT MANAGER
First steps to get started
Step 1: You've connected your LinkedIn account
Step 2: Campaign creation complete
Step 3: You paused at "Fill campaign with profiles"
Personal workspace
ID: 531684
Sarvesh Singh
sarveshsingh740@gmail.com
LinkedIn accounts
All
Running
Stopped
LinkedIn account
State
Access
License
Archived
jort.hubers@gmail.com
Jort Hubers
Show password
Details
Collecting
Owner
Aug 9, 2026
Pro
No
sarveshsingh7400@gmail.com
not logged in
Show password
Details
-
Owner
No`;

const JULY_26 = new Date("2026-07-26T12:00:00Z");

test("parses the workspace id", () => {
  assert.equal(parseAccountScreen(ACCOUNT_SCREEN).workspace, "531684");
});

test("reads an absolute licence date, not just a countdown", () => {
  const jort = parseAccountScreen(IN_USE_SCREEN, JULY_26).accounts[0];
  assert.equal(jort.licenceUntil, "2026-08-09");
  assert.equal(jort.licenceDaysLeft, 14);
  assert.equal(jort.licenceState, "valid");
});

test("knows 'Collecting' is a state", () => {
  assert.equal(parseAccountScreen(IN_USE_SCREEN, JULY_26).accounts[0].state, "Collecting");
});

test("an expired date reads as expired, not as valid", () => {
  const past = IN_USE_SCREEN.replace("Aug 9, 2026", "Jun 1, 2026");
  const jort = parseAccountScreen(past, JULY_26).accounts[0];
  assert.ok(jort.licenceDaysLeft < 0);
  assert.equal(jort.licenceState, "expired");
});

test("an unreadable licence is 'unknown', never 'expired'", () => {
  // The failure that matters: LH2 changes the column again and we cannot read
  // it. That must not be reported as a dead licence on a working account.
  const odd = IN_USE_SCREEN.replace("Aug 9, 2026", "renews next quarter").replace(/^Pro$/m, "Enterprise");
  const jort = parseAccountScreen(odd, JULY_26).accounts[0];
  assert.equal(jort.licenceDaysLeft, null);
  assert.equal(jort.licenceState, "unknown");
  assert.notEqual(jort.licenceState, "expired");
});

test("the campaign now exists, so the setup nag is gone", () => {
  assert.equal(parseAccountScreen(IN_USE_SCREEN, JULY_26).noCampaignsYet, false);
});

test("finds exactly the two LinkedIn accounts, not the signed-in LH2 user", () => {
  const { accounts } = parseAccountScreen(ACCOUNT_SCREEN);
  assert.deepEqual(
    accounts.map((a) => a.email),
    ["jort.hubers@gmail.com", "sarveshsingh7400@gmail.com"],
  );
});

test("reads the licence countdown, which is the deadline that matters", () => {
  const jort = parseAccountScreen(ACCOUNT_SCREEN).accounts[0];
  assert.equal(jort.name, "Jort Hubers");
  assert.equal(jort.licenceDaysLeft, 14);
  assert.equal(jort.licence, "Pro");
  assert.equal(jort.state, "Stopped");
  assert.equal(jort.loggedIn, true);
});

test("spots an account that is not logged in", () => {
  const second = parseAccountScreen(ACCOUNT_SCREEN).accounts[1];
  assert.equal(second.loggedIn, false);
  assert.equal(second.licenceDaysLeft, null);
});

test("notices there are no campaigns yet", () => {
  assert.equal(parseAccountScreen(ACCOUNT_SCREEN).noCampaignsYet, true);
});

test("a campaign screen is not an error, just not the account screen", () => {
  assert.equal(parseAccountScreen("CAMPAIGNS\nMy first campaign\nRunning"), null);
  assert.equal(parseAccountScreen(""), null);
  assert.equal(parseAccountScreen(undefined), null);
});

test("the accounts table without its header row is not parsed as accounts", () => {
  // Guards the anchor: sidebar text alone must never yield an account.
  const sidebarOnly = `Personal workspace
ID: 531684
Sarvesh Singh
sarveshsingh740@gmail.com
LinkedIn accounts
All
Running
Stopped`;
  assert.equal(parseAccountScreen(sidebarOnly), null);
});

test("the bridge refuses callers without the token", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-bridge-"));
  const port = 7900 + Math.floor(Math.random() * 90);

  const child = spawn(process.execPath, [path.join(REPO, "bridge", "server.mjs")], {
    cwd: dir,
    env: { ...process.env, STRIDE_BRIDGE_PORT: String(port) },
    stdio: "ignore",
  });

  try {
    await waitForPing(port);

    const anonymous = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(anonymous.status, 401, "no token must not reach /health");

    const wrong = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Authorization: "Bearer " + "0".repeat(64) },
    });
    assert.equal(wrong.status, 401, "a wrong token must not reach /health");

    const { token } = JSON.parse(fs.readFileSync(path.join(dir, "data", "bridge.json"), "utf8"));
    assert.ok(token.length >= 64, "the minted token must not be guessable");

    const good = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(good.status, 200, "the real token must get through");
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- reading Linked Helper's database ------------------------------------
//
// Built against the real schema (LH2 2.122.19) rather than mocked, so a schema
// change shows up here instead of on the page.

function fakeLhHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "stride-lh-"));
  const dir = path.join(home, "Partitions", "linked-helper-account-579196-main");
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(path.join(dir, "lh.db"));
  db.exec(`
    CREATE TABLE li_accounts(id INTEGER PRIMARY KEY, external_id INTEGER, full_name TEXT,
      full_name_uppercase TEXT, avatar TEXT, email TEXT, last_login_at TEXT,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE campaigns(id INTEGER PRIMARY KEY, uuid TEXT NOT NULL, name TEXT,
      description TEXT, type INTEGER NOT NULL, is_paused INTEGER DEFAULT 1,
      is_archived INTEGER DEFAULT 0, is_valid INTEGER, is_hidden INTEGER NOT NULL DEFAULT 0,
      is_readonly INTEGER NOT NULL DEFAULT 0, is_stand_by_mode_active INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 0, li_account_id INTEGER NOT NULL, created_at TEXT);
    CREATE TABLE campaign_actions(id INTEGER PRIMARY KEY, rowid_ INTEGER, campaign_id INTEGER,
      version_id INTEGER, action_id INTEGER, action_name TEXT, action_description TEXT,
      action_startAt TEXT);
    CREATE TABLE collection_people(id INTEGER PRIMARY KEY);
    CREATE TABLE daily_limits(id INTEGER PRIMARY KEY, li_account_id INTEGER, max_limit INTEGER);
    -- A person table, present and deliberately never read.
    CREATE TABLE person_mini_profile(id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT);

    INSERT INTO li_accounts(id, external_id, full_name, email, last_login_at)
      VALUES (1, 579196, 'Jort Hubers', 'jort.hubers@gmail.com', '2026-07-26T16:40:18.441Z');
    INSERT INTO campaigns(id, uuid, name, description, type, is_paused, is_archived, is_valid,
      is_hidden, li_account_id, created_at)
      VALUES (1, 'uuid-live', 'first draft campaign', '', 1, 1, 0, 1, 0, 1, '2026-07-26T17:03:45.796Z'),
             (2, 'uuid-hidden', 'internal', '', 1, 1, 0, 1, 1, 1, '2026-07-26T17:03:45.796Z'),
             (3, 'uuid-running', 'live one', '', 1, 0, 0, 1, 0, 1, '2026-07-25T09:00:00.000Z');
    INSERT INTO campaign_actions(id, campaign_id, action_id, action_name)
      VALUES (1, 1, 1, ''), (2, 1, 2, 'check who''s already accepted invitations');
    INSERT INTO daily_limits(id, li_account_id, max_limit) VALUES (1, 1, 150);
    INSERT INTO person_mini_profile(id, first_name, last_name) VALUES (1, 'Someone', 'Private');
  `);
  db.close();
  return home;
}

test("finds the per-account database inside the Partitions folder", () => {
  const home = fakeLhHome();
  try {
    const found = findAccountDbs(home);
    assert.equal(found.length, 1);
    assert.equal(found[0].partitionAccountId, "579196");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("reads campaigns, their state and their steps", () => {
  const home = fakeLhHome();
  const previous = process.env.STRIDE_LH_HOME;
  process.env.STRIDE_LH_HOME = home;
  try {
    // db.mjs resolves the home at import time, so go through the same door the
    // bridge does rather than trusting the env var alone.
    const found = findAccountDbs(home);
    assert.equal(found.length, 1);

    const db = new DatabaseSync(found[0].file, { readOnly: true });
    const visible = db.prepare("SELECT COUNT(*) n FROM campaigns WHERE is_hidden = 0").get().n;
    db.close();
    assert.equal(visible, 2, "hidden campaigns must not be listed");
  } finally {
    if (previous === undefined) delete process.env.STRIDE_LH_HOME;
    else process.env.STRIDE_LH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("a missing Linked Helper profile is a clear message, not a crash", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "stride-nolh-"));
  try {
    assert.throws(() => findAccountDbs(empty), DbUnavailable);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test("nothing in the campaign read touches a person table", () => {
  // The schema carries ~40 tables of third-party LinkedIn profiles. The console
  // needs counts, never rows, and this pins that promise to the source.
  const source = fs.readFileSync(new URL("../bridge/db.mjs", import.meta.url), "utf8");
  const selects = source.match(/FROM\s+([a-z_]+)/gi) ?? [];
  const personTables = selects.filter((s) => /FROM\s+person_|FROM\s+organization_/i.test(s));
  assert.deepEqual(personTables, [], `db.mjs selects from ${personTables.join(", ")}`);
});

async function waitForPing(port, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ping`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`bridge did not start on port ${port}`);
}
