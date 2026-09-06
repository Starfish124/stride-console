// Pacing, suppression and the import — the three things standing between a
// lead book and somebody's LinkedIn account getting restricted.
//
// Every test here is a bug that was real when this file was written:
//
//   1. A step held by a cap aged past the too-late rule and the runner SKIPPED
//      it, then queued the follow-up as though the connection had been made.
//   2. Counting queued rows against the cap meant the console capped its own
//      output rather than the account's exposure.
//   3. Lint passed a note against "Acme BV" that merged 40 characters over
//      LinkedIn's limit against a real company name in the book.
//   4. Suppression matched on the enrolment's address, which a LinkedIn-only
//      enrolment does not have.
//
// Same sandbox discipline as the other salesnav tests: lib/store.ts resolves
// DATA_DIR from process.cwd() at import, so this runs in a throwaway directory
// or it writes into the founders' live client book.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);

const PREAMBLE = `
import fs from "node:fs";
import * as base from ${mod("lib/store.ts")};
import * as sequences from ${mod("lib/outreach/sequence.ts")};
import * as store from ${mod("lib/salesnav/store.ts")};
import * as enrol from ${mod("lib/salesnav/enrol.ts")};
import * as manual from ${mod("lib/salesnav/manual.ts")};
import * as runner from ${mod("lib/salesnav/runner.ts")};
import * as suppress from ${mod("lib/salesnav/suppress.ts")};
import * as leads from ${mod("lib/leads.ts")};
import { LIMITS } from ${mod("lib/outreach/lint.ts")};

const BASIS = {
  kind: "legitimate-interest",
  reason: "Met at the Lelystad ops meetup and asked for the invoice write-up.",
  source: "Lelystad ops meetup, June",
};

/** Monday 2026-08-03, inside the default window. */
const MONDAY = new Date(2026, 7, 3, 9, 0, 0);
const LATER = new Date(2026, 7, 3, 11, 0, 0);
const days = (n) => new Date(MONDAY.getTime() + n * 86400000);

const CONNECT = "{first_name}, you run {role} at {company}. We got six hours a week back for a firm that size by fixing one invoice check.";

function client(overrides = {}) {
  return base.addClient({
    name: "Jane Doe",
    company: "Acme BV",
    stage: "lead",
    email: "jane@acme.nl",
    linkedin: "https://www.linkedin.com/in/janedoe",
    role: "ops lead",
    need: "invoice checking",
    ...overrides,
  });
}

/** LinkedIn only, so nothing here depends on an email address existing. */
function seq(body) {
  return sequences.saveSequence({
    name: "LinkedIn first",
    audience: "NL groothandel ops leads",
    steps: [
      { kind: "connect", waitDays: 0, body: body ?? CONNECT },
      { kind: "message", waitDays: 2, body: "{first_name}, did the write-up land." },
    ],
  });
}

function enrolOne(overrides = {}, body) {
  const c = client(overrides);
  const s = seq(body);
  const result = enrol.enrol({ clientId: c.id, sequenceId: s.id, basis: BASIS, by: "Sarvesh", now: MONDAY });
  return { client: c, sequence: s, result, enrolment: result.enrolment };
}

const out = (value) => console.log(JSON.stringify(value));
`;

function inSandbox(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-li-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `${PREAMBLE}\n${source}`],
      { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } },
    );
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- the cap must not become a silent skip ---------------------------------

test("a step held by the cap still holds four days later, instead of being skipped", () => {
  const result = inSandbox(
    `
    const ctx = enrolOne();
    await runner.tick(LATER);                      // held immediately: cap is 0
    const tick = await runner.tick(days(4));       // now past maxLateDays

    const after = store.getEnrolment(ctx.enrolment.id);
    out({
      stepIndex: after.stepIndex,
      state: after.state,
      held: tick.held,
      queued: store.listManualSteps().length,
      skipped: store.listManualSteps().filter((m) => m.state === "skipped").length,
      sends: store.listSends().length,
    });
  `,
    { SALESNAV_LI_DAILY: "0" },
  );

  // The whole point: nothing moved. A connection request nobody was ever shown
  // is not "too late" — advancing past it would queue the follow-up as a reply
  // to a handshake that never happened.
  assert.equal(result.stepIndex, 0);
  assert.equal(result.state, "active");
  assert.equal(result.held, 1);
  assert.equal(result.queued, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.sends, 0);
});

// --- what the cap counts ---------------------------------------------------

test("queued-but-unsent steps do not consume the day's cap; sent ones do", () => {
  const result = inSandbox(
    `
    const a = enrolOne({ name: "Ann Bakker", linkedin: "https://www.linkedin.com/in/annbakker", email: "ann@a.nl" });
    const b = enrolOne({ name: "Bas Smit", linkedin: "https://www.linkedin.com/in/bassmit", email: "bas@b.nl" });
    await runner.tick(LATER);

    // Two drafts sitting there, nothing sent. LinkedIn has seen neither.
    const waitingAfterQueue = store.listManualSteps().filter((m) => m.state === "waiting").length;

    // A person sends one. THAT is what the account is metered on.
    manual.completeManual(store.listManualSteps()[0].key, "Sarvesh", LATER);

    const c = enrolOne({ name: "Cor Vos", linkedin: "https://www.linkedin.com/in/corvos", email: "cor@c.nl" });
    const tick = await runner.tick(LATER);

    out({
      waitingAfterQueue,
      heldAfterSend: tick.held,
      cHasDraft: store.listManualSteps().some((m) => m.enrolmentId === c.enrolment.id),
    });
  `,
    { SALESNAV_LI_DAILY: "1", SALESNAV_LI_QUEUE: "50" },
  );

  // Both queued under a cap of one, because neither had been sent.
  assert.equal(result.waitingAfterQueue, 2);
  // Once one is actually sent the cap is spent, and the third holds.
  assert.equal(result.heldAfterSend, 1);
  assert.equal(result.cHasDraft, false);
});

test("yesterday's sends do not count against today", () => {
  const result = inSandbox(
    `
    const a = enrolOne();
    await runner.tick(LATER);
    // Sent on the Monday.
    manual.completeManual(store.listManualSteps()[0].key, "Sarvesh", LATER);

    out({
      monday: manual.sentLinkedInToday(LATER),
      tuesday: manual.sentLinkedInToday(days(1)),
    });
  `,
    { SALESNAV_LI_DAILY: "1", TZ: "Europe/Amsterdam" },
  );

  assert.equal(result.monday, 1);
  assert.equal(result.tuesday, 0);
});

// --- the merged length -----------------------------------------------------

test("a note that lints against Acme BV but overruns against a real company holds", () => {
  const result = inSandbox(`
    const REAL = "MAAT | Transport | Techniek | Heftrucks | Logistiek | Truckparq 24/7";
    const body = CONNECT + " Worth twenty minutes to walk through where the hours actually go in a week, and what the first fix would be. No deck, just the numbers.";

    const ctx = enrolOne({ company: REAL }, body);
    const tick = await runner.tick(LATER);
    const after = store.getEnrolment(ctx.enrolment.id);

    out({
      template: body.length,
      merged: body.replace("{first_name}", "Jane").replace("{role}", "ops lead").replace("{company}", REAL).length,
      hard: LIMITS.connect.hard,
      queued: store.listManualSteps().length,
      held: tick.held,
      stepIndex: after.stepIndex,
      line: tick.lines.find((l) => l.includes("held")),
    });
  `);

  // The template itself is legal — this is exactly why lint at save time
  // cannot catch it.
  assert.ok(result.template <= result.hard, `template was ${result.template}`);
  assert.ok(result.merged > result.hard, `merged was ${result.merged}`);
  // Merged against a 68-character company name it is not, so it holds rather
  // than handing somebody 340 characters to paste.
  assert.equal(result.queued, 0);
  assert.equal(result.held, 1);
  assert.equal(result.stepIndex, 0);
  assert.match(result.line, /connection note takes 300/);
});

// --- suppression -----------------------------------------------------------

test("suppressing a profile stops the live LinkedIn-only enrolment and refuses a new one", () => {
  const result = inSandbox(`
    const ctx = enrolOne({ email: undefined });
    await runner.tick(LATER);

    // No address anywhere in this: the client has none, which is true of 31 of
    // the 148 leads Apollo found. Matching on the enrolment's address — which
    // is what the email path does — would therefore stop nothing at all.
    suppress.suppress({
      address: "http://www.linkedin.com/in/janedoe/",
      reason: "asked",
      by: "Sarvesh",
    });

    const after = store.getEnrolment(ctx.enrolment.id);
    const again = enrol.enrol({ clientId: ctx.client.id, sequenceId: ctx.sequence.id, basis: BASIS, by: "Sarvesh", now: LATER });

    out({
      enrolmentEmail: ctx.enrolment.email,
      stored: store.listSuppressions()[0].address,
      state: after.state,
      reason: after.stoppedReason,
      reEnrolled: again.ok,
      refusal: again.problem,
    });
  `);

  assert.equal(result.enrolmentEmail, "");
  // Stored as a slug, so http/https/www/trailing-slash all collapse, and it
  // cannot be mistaken for an address by domainOf.
  assert.equal(result.stored, "linkedin:janedoe");
  assert.equal(result.state, "stopped");
  assert.match(result.reason, /[Ss]uppressed/);
  // And the door stays shut afterwards.
  assert.equal(result.reEnrolled, false);
  assert.match(result.refusal, /suppression list/);
});

test("sweep stops an enrolment whose profile is already on the list", () => {
  const result = inSandbox(`
    const ctx = enrolOne({ email: undefined });
    await runner.tick(LATER);

    // Written straight to the list, bypassing suppress()'s own stop loop, so
    // this tests the second choke point rather than the first. Suppression is
    // the one unconditional promise here; one place to enforce it is one place
    // to get it wrong.
    store.putSuppression({
      address: "linkedin:janedoe",
      reason: "asked",
      at: LATER.toISOString(),
      by: "Sarvesh",
    });

    const swept = enrol.sweep();
    const after = store.getEnrolment(ctx.enrolment.id);
    out({ stopped: swept.stopped.length, state: after.state, reason: after.stoppedReason });
  `);

  assert.equal(result.stopped, 1);
  assert.equal(result.state, "stopped");
  assert.match(result.reason, /suppression list/);
});

// --- the importer ----------------------------------------------------------

test("importing the lead book twice adds everyone once and leaves the existing book alone", () => {
  const result = inSandbox(`
    const mine = base.addClient({ name: "Bianca Wouters", company: "Wouters BV", stage: "talking",
      linkedin: "https://www.linkedin.com/in/biancawouters1" });

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/apollo-leads.json", JSON.stringify({
      list: { id: "l1", name: "NL logistics ICP", url: "https://app.apollo.io" },
      filters: { location: "NL", industries: [], employees: "50-500", titles: [] },
      poolSize: 2701,
      exportedAt: "2026-09-01T00:00:00.000Z",
      leads: [
        // Same person as the client above, spelled the way Apollo writes it.
        { id: "a1", name: "Bianca Wouters", title: "COO", company: "Wouters BV", companyDomain: "w.nl",
          employees: 80, industry: "logistics", city: "Almere", country: "NL",
          email: "", emailStatus: "", linkedin: "http://www.linkedin.com/in/biancawouters1", apolloUrl: "x" },
        { id: "a2", name: "Kevin Verstraten", title: "Operations Manager", company: "Vervoer BV", companyDomain: "v.nl",
          employees: 120, industry: "logistics", city: "Tilburg", country: "NL",
          email: "kevin@v.nl", emailStatus: "verified", linkedin: "https://www.linkedin.com/in/kevinverstraten", apolloUrl: "y" },
        { id: "a3", name: "", title: "", company: "", companyDomain: "", employees: null, industry: "",
          city: "", country: "", email: "", emailStatus: "", linkedin: "", apolloUrl: "z" },
      ],
    }));

    const dry = leads.importLeads();
    const afterDry = base.listClients().length;

    const real = leads.importLeads({ dryRun: false });
    const second = leads.importLeads({ dryRun: false });

    const kevin = base.listClients().find((c) => c.name === "Kevin Verstraten");
    const bianca = base.listClients().find((c) => c.id === mine.id);

    out({
      dryImported: dry.imported.length,
      dryWroteNothing: afterDry === 1,
      imported: real.imported.length,
      known: real.known.map((k) => k.matched),
      unusable: real.unusable.length,
      secondRun: second.imported.length,
      total: base.listClients().length,
      kevin: { role: kevin.role, email: kevin.email, stage: kevin.stage, source: kevin.source },
      kevinKeys: Object.keys(kevin).sort().join(","),
      biancaUntouched: bianca.stage === "talking" && bianca.company === "Wouters BV",
    });
  `);

  assert.equal(result.dryImported, 1);
  assert.ok(result.dryWroteNothing, "a dry run must not write");
  assert.equal(result.imported, 1);
  // http://www. against https://www. is the same person. Matching raw would
  // have created a duplicate of a real client.
  assert.deepEqual(result.known, ["profile"]);
  assert.equal(result.unusable, 1);
  assert.equal(result.secondRun, 0, "a second import must be a no-op");
  assert.equal(result.total, 2);
  assert.deepEqual(result.kevin, {
    role: "Operations Manager",
    email: "kevin@v.nl",
    stage: "lead",
    source: "Apollo — NL logistics ICP",
  });
  // Six mapped fields and nothing else: addClient writes whatever it is handed,
  // and apolloUrl, employees and industry have no business in the client book.
  assert.equal(
    result.kevinKeys,
    "company,createdAt,email,id,linkedin,name,role,source,stage,touches,updatedAt",
  );
  assert.ok(result.biancaUntouched, "an existing client must not be rewritten");
});

// --- the reply -------------------------------------------------------------

test("marking a LinkedIn reply stops the whole sequence, not just the step", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    await runner.tick(LATER);
    const key = store.listManualSteps()[0].key;

    manual.repliedManual(key, "Jort", LATER);
    const after = store.getEnrolment(ctx.enrolment.id);
    const row = store.findManualStep(key);

    out({
      state: after.state,
      reason: after.stoppedReason,
      stepIndex: after.stepIndex,
      rowState: row.state,
      touched: base.getClient(ctx.client.id).touches.length,
    });
  `);

  assert.equal(result.state, "stopped");
  assert.match(result.reason, /replied/i);
  // Not advanced to the follow-up. Skipping would have moved it on and left
  // sweep to catch it a tick later.
  assert.equal(result.stepIndex, 0);
  assert.equal(result.rowState, "skipped");
  assert.equal(result.touched, 1);
});
