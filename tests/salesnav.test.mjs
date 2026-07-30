// The safety layer of the email sequencer.
//
// Every case here is a way this thing could email somebody it must not, or
// email somebody twice. They are the tests that matter most in this repo,
// because the failure is not a wrong number on a page, it is a real message in
// a real stranger's inbox that cannot be recalled.
//
// Everything runs in a throwaway working directory. lib/store.ts resolves
// DATA_DIR from process.cwd() at import, so a careless test writes into the
// founders' live client book. tests/outreach.test.mjs records that happening
// once already.

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
import * as base from ${mod("lib/store.ts")};
import * as sequences from ${mod("lib/outreach/sequence.ts")};
import * as store from ${mod("lib/salesnav/store.ts")};
import * as guard from ${mod("lib/salesnav/guard.ts")};
import * as suppress from ${mod("lib/salesnav/suppress.ts")};
import * as enrol from ${mod("lib/salesnav/enrol.ts")};
import * as send from ${mod("lib/salesnav/send.ts")};
import * as runner from ${mod("lib/salesnav/runner.ts")};

const BASIS = {
  kind: "legitimate-interest",
  reason: "Met at the Lelystad ops meetup and asked for the invoice write-up.",
  source: "Lelystad ops meetup, June",
};

/** A client and a two step email sequence, ready to enrol. */
function seed(overrides = {}) {
  const client = base.addClient({
    name: "Jane Doe",
    company: "Acme BV",
    stage: "lead",
    email: "jane@acme.nl",
    role: "ops lead",
    need: "invoice checking",
    ...overrides,
  });
  const sequence = sequences.saveSequence({
    name: "Ops opener",
    audience: "MKB ops leads",
    steps: [
      { kind: "email", waitDays: 0, subject: "invoice checks at {company}", body: "Hi {first_name}, you run {role} at {company}. We got six hours a week back for a company that size by fixing one invoice check. Happy to send what we did." },
      { kind: "email", waitDays: 3, subject: "one more on {company}", body: "Hi {first_name}, the write-up is two pages. Want it." },
    ],
  });
  return { client, sequence };
}

function enrolOne(overrides) {
  const { client, sequence } = seed(overrides);
  const result = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });
  if (!result.ok) throw new Error("enrol refused: " + result.problem);
  return { client, sequence, enrolment: result.enrolment };
}

async function sendFirst(ctx, now = new Date()) {
  return send.attemptSend(ctx.enrolment, ctx.sequence.steps[0], ctx.client, ctx.sequence.steps, now);
}

const out = (value) => console.log(JSON.stringify(value));
`;

/** Run a snippet with cwd in a fresh temp directory, and read its last line. */
function inSandbox(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-salesnav-"));
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

// --- the default -----------------------------------------------------------

test("with no environment at all it runs dry and records what it would have sent", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    const attempt = await sendFirst(ctx);
    out({ attempt, ledger: store.listSends() });
  `);

  assert.equal(result.attempt.outcome, "sent");
  const [record] = result.ledger;
  assert.equal(record.dryRun, true, "a fresh checkout must never send for real");
  assert.equal(record.provider, "dry");
  assert.ok(record.providerId.startsWith("dry_"));
  assert.equal(record.state, "sent");
  assert.equal(record.subject, "invoice checks at Acme BV", "merge fields are resolved in the record");
  assert.ok(record.body.includes("Hi Jane,"), "the full rendered body is kept, not a reference to it");
  assert.ok(record.body.includes("Not interested: "), "every message carries a way out");
  assert.equal(record.basis.reason.length >= 20, true, "the lawful basis is copied onto the send");
});

test("live mode refuses to exist without a reachable https unsubscribe URL", () => {
  const result = inSandbox(
    `
    const config = await import(${mod("lib/salesnav/config.ts")});
    out({ mode: config.salesnavMode(), blockers: config.liveBlockers() });
  `,
    {
      STRIDE_SALESNAV: "live",
      RESEND_API_KEY: "re_test",
      SALESNAV_FROM: "Stride <hi@stride-ai.nl>",
      SALESNAV_PUBLIC_URL: "http://127.0.0.1:3000",
    },
  );
  assert.equal(result.mode, "dry", "an unsubscribe link nobody can reach is a broken promise");
  assert.deepEqual(result.blockers, ["SALESNAV_PUBLIC_URL (https)"]);
});

// --- the suppression list --------------------------------------------------

test("a suppressed address is refused, and the enrolment stops rather than retrying", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    suppress.suppress({ address: "JANE@acme.nl", reason: "unsubscribed", by: "one-click" });
    const attempt = await sendFirst(ctx);
    out({ attempt, enrolment: store.getEnrolment(ctx.enrolment.id), sends: store.listSends() });
  `);
  assert.equal(result.attempt.outcome, "skipped");
  assert.match(result.attempt.detail, /suppression list \(unsubscribed\)/);
  assert.equal(result.enrolment.state, "stopped", "never ask a second time");
  assert.equal(result.sends[0].state, "skipped");
});

test("suppressing a whole domain catches every address inside it", () => {
  const result = inSandbox(`
    suppress.suppress({ address: "@acme.nl", reason: "complained", by: "Sarvesh" });
    out({
      inside: !!suppress.isSuppressed("someone.else@acme.nl"),
      outside: !!suppress.isSuppressed("someone@other.nl"),
    });
  `);
  assert.equal(result.inside, true);
  assert.equal(result.outside, false);
});

test("an unsubscribe stops the sequence, not just the next step", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    suppress.suppress({ address: "jane@acme.nl", reason: "unsubscribed", by: "one-click" });
    out(store.getEnrolment(ctx.enrolment.id));
  `);
  assert.equal(result.state, "stopped");
});

// --- the caps --------------------------------------------------------------

test("the daily cap refuses the send after it is spent, and does not stop the enrolment", () => {
  const result = inSandbox(
    `
    const first = enrolOne();
    const a = await sendFirst(first);
    const second = enrolOne({ name: "Bram Jansen", email: "bram@other.nl" });
    const b = await sendFirst(second);
    out({ a, b, enrolment: store.getEnrolment(second.enrolment.id) });
  `,
    { SALESNAV_DAILY_CAP: "1" },
  );
  assert.equal(result.a.outcome, "sent");
  assert.equal(result.b.outcome, "skipped");
  assert.match(result.b.detail, /cap of 1 is spent/);
  assert.equal(result.enrolment.state, "active", "tomorrow is a fine time to try again");
  assert.equal(result.enrolment.stepIndex, 0, "a refused step does not advance");
});

test("the per-domain cap stops three cold emails walking into one company", () => {
  const result = inSandbox(
    `
    const attempts = [];
    for (const name of ["Jane Doe", "Bram Jansen"]) {
      const ctx = enrolOne({ name, email: name.split(" ")[0].toLowerCase() + "@acme.nl" });
      attempts.push(await sendFirst(ctx));
    }
    out(attempts);
  `,
    { SALESNAV_DOMAIN_CAP: "1", SALESNAV_DAILY_CAP: "40" },
  );
  assert.equal(result[0].outcome, "sent");
  assert.equal(result[1].outcome, "skipped");
  assert.match(result[1].detail, /already went to acme\.nl today/);
});

// --- the stop switch -------------------------------------------------------

test("the hard stop refuses everything, and outranks a perfectly good send", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    store.setHardStop({ stopped: true, by: "Jort", reason: "Checking the copy." });
    const attempt = await sendFirst(ctx);
    const tick = await runner.tick(new Date());
    out({ attempt, tick, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.equal(result.attempt.outcome, "skipped");
  assert.match(result.attempt.detail, /All sending is stopped/);
  assert.equal(result.tick.ran, false, "the tick itself refuses to start");
  assert.equal(result.enrolment.state, "active", "a stop is a pause, not a cancellation");
});

// --- merge fields ----------------------------------------------------------

test("an unresolved merge field refuses the send and names the field", () => {
  const result = inSandbox(`
    const ctx = enrolOne({ role: undefined });
    const attempt = await sendFirst(ctx);
    out({ attempt, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.equal(result.attempt.outcome, "skipped");
  assert.match(result.attempt.detail, /no role/, "the refusal has to name what is missing");
  assert.equal(result.enrolment.state, "stopped");
});

// --- the voice gate --------------------------------------------------------

test("an exclamation mark is refused by the gate and never reaches a provider", () => {
  const result = inSandbox(`
    const client = base.addClient({ name: "Jane Doe", company: "Acme BV", stage: "lead", email: "jane@acme.nl", role: "ops lead", need: "x" });
    const sequence = sequences.saveSequence({
      name: "Loud", audience: "anyone",
      steps: [{ kind: "email", waitDays: 0, subject: "hello {first_name}", body: "Hi {first_name}, great news!" }],
    });
    const r = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });
    const attempt = await send.attemptSend(r.enrolment, sequence.steps[0], client, sequence.steps, new Date());
    out({ attempt, sends: store.listSends(), enrolment: store.getEnrolment(r.enrolment.id) });
  `);
  assert.equal(result.attempt.outcome, "skipped");
  assert.match(result.attempt.detail, /voice gate refused/);
  assert.equal(result.sends[0].state, "skipped");
  assert.equal(result.sends[0].providerId, undefined, "no provider was ever called");
  assert.equal(result.enrolment.state, "paused", "copy can be fixed, so it pauses rather than stops");
});

test("a subject faking a reply is refused", () => {
  const result = inSandbox(`
    out(guard.lintEmailStep({ subject: "Re: our chat", body: "Hi {first_name}, here is the write up." }));
  `);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.rule === "fakeThread"));
});

// --- idempotency -----------------------------------------------------------

test("the same step attempted twice produces exactly one sent record", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    const first = await sendFirst(ctx);
    // Exactly the crash-restart case: the same enrolment object, run again.
    const second = await sendFirst(ctx);
    out({ first, second, sends: store.listSends() });
  `);
  assert.equal(result.first.outcome, "sent");
  assert.equal(result.second.outcome, "already-sent", "the ledger is checked before anything else");
  assert.equal(result.sends.length, 1, "one key, one row, whatever happens");
  assert.equal(result.sends[0].state, "sent");
  assert.equal(result.sends[0].attempts, 1);
});

test("a claimed send with two attempts and no answer becomes stuck, not a third try", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    const key = ctx.enrolment.id + ":" + ctx.sequence.steps[0].id;
    store.putSend({
      key, id: "snd_test", enrolmentId: ctx.enrolment.id, clientId: ctx.client.id,
      sequenceId: ctx.sequence.id, stepId: ctx.sequence.steps[0].id,
      to: "jane@acme.nl", subject: "s", body: "b",
      state: "sending", dryRun: false, provider: "resend",
      basis: ctx.enrolment.basis, claimedAt: new Date().toISOString(), attempts: 2,
    });
    const attempt = await sendFirst(ctx);
    out({ attempt, sends: store.listSends(), enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.equal(result.attempt.outcome, "stuck");
  assert.equal(result.sends.length, 1);
  assert.equal(result.sends[0].state, "stuck", "unknown is unknown, and a person looks at it");
  assert.equal(result.enrolment.state, "paused");
});

test("a send refused yesterday is counted against the day it actually goes out", () => {
  // The cap is read from the ledger so it survives a restart, and the ledger
  // buckets by claimedAt. refuse() writes on the same key as the claim, so a
  // claim that inherited a refusal's timestamp put today's real send on
  // yesterday's shelf and left today's quota untouched for the next address.
  const result = inSandbox(`
    const ctx = enrolOne();
    const key = ctx.enrolment.id + ":" + ctx.sequence.steps[0].id;
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);

    // Yesterday the cap was spent, so this step was turned away.
    store.putSend({
      key, id: "snd_refused", enrolmentId: ctx.enrolment.id, clientId: ctx.client.id,
      sequenceId: ctx.sequence.id, stepId: ctx.sequence.steps[0].id,
      to: "jane@acme.nl", subject: "s", body: "b",
      state: "skipped", dryRun: true, provider: "dry", problem: "Today's cap is spent",
      basis: ctx.enrolment.basis,
      claimedAt: yesterday.toISOString(), finishedAt: yesterday.toISOString(), attempts: 0,
    });

    const now = new Date();
    const attempt = await sendFirst(ctx, now);
    const record = store.listSends().find((r) => r.key === key);
    const today = guard.sentToday(now, true);
    out({ attempt, claimedAt: record.claimedAt, attempts: record.attempts, countedToday: today.total });
  `);

  assert.equal(result.attempt.outcome, "sent");
  assert.equal(
    new Date(result.claimedAt).toDateString(),
    new Date().toDateString(),
    "a refusal must not donate its date to a later real send",
  );
  assert.equal(result.countedToday, 1, "the send has to consume today's quota, not yesterday's");
  assert.equal(result.attempts, 1, "a refusal is not an attempt at the provider");
});

test("a refusal never overwrites a claim whose outcome is unknown", () => {
  // "sending" means assume delivered. Turning one back into a skipped row
  // hands a day's quota back for a message that may be in somebody's inbox,
  // resets the attempt count that stops it retrying forever, and leaves the
  // console denying it ever wrote to a person who is holding the email.
  const result = inSandbox(`
    const ctx = enrolOne();
    const key = ctx.enrolment.id + ":" + ctx.sequence.steps[0].id;
    const claimedAt = new Date().toISOString();
    store.putSend({
      key, id: "snd_inflight", enrolmentId: ctx.enrolment.id, clientId: ctx.client.id,
      sequenceId: ctx.sequence.id, stepId: ctx.sequence.steps[0].id,
      to: "jane@acme.nl", subject: "s", body: "b",
      state: "sending", dryRun: true, provider: "dry",
      basis: ctx.enrolment.basis, claimedAt, attempts: 1,
    });

    // She got the mail and unsubscribed, so the next tick is refused.
    suppress.suppress({ address: "jane@acme.nl", reason: "unsubscribed", by: "one-click" });
    const now = new Date();
    const attempt = await sendFirst(ctx, now);
    const record = store.listSends().find((r) => r.key === key);
    out({ attempt, state: record.state, attempts: record.attempts, countedToday: guard.sentToday(now, true).total });
  `);

  assert.equal(result.state, "sending", "an unknown outcome stays unknown");
  assert.equal(result.attempts, 1, "the retry ceiling must not be reset by a refusal");
  assert.equal(result.countedToday, 1, "the claimed quota is not handed back");
});

// --- one-click unsubscribe -------------------------------------------------

test("a forged unsubscribe token is rejected and a real one is honoured", () => {
  const result = inSandbox(`
    const real = suppress.unsubToken("jane@acme.nl");
    out({
      real,
      good: suppress.verifyUnsubToken("jane@acme.nl", real),
      forged: suppress.verifyUnsubToken("jane@acme.nl", "x".repeat(real.length)),
      empty: suppress.verifyUnsubToken("jane@acme.nl", null),
      otherAddress: suppress.verifyUnsubToken("bram@acme.nl", real),
      roundTrip: suppress.decodeAddress(suppress.encodeAddress("Jane+Tag@Acme.NL")),
    });
  `);
  assert.equal(result.good, true);
  assert.equal(result.forged, false);
  assert.equal(result.empty, false);
  assert.equal(result.otherAddress, false, "a token for one person cannot unsubscribe another");
  assert.equal(result.roundTrip, "jane+tag@acme.nl", "a plus in an address survives the round trip");
  assert.equal(result.real.length, 32);
});

// --- the lawful basis ------------------------------------------------------

test("a thin lawful basis is refused, and the refusal names the field", () => {
  const result = inSandbox(`
    const { client, sequence } = seed();
    const thin = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: { kind: "legitimate-interest", reason: "lead", source: "list" }, by: "Sarvesh" });
    const noSource = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: { kind: "legitimate-interest", reason: "Met at the Lelystad ops meetup in June.", source: "" }, by: "Sarvesh" });
    out({ thin, noSource });
  `);
  assert.equal(result.thin.ok, false);
  assert.equal(result.thin.field, "basis.reason");
  assert.equal(result.noSource.ok, false);
  assert.equal(result.noSource.field, "basis.source");
});

// --- the automatic stops ---------------------------------------------------

test("a stage move past the one at enrolment stops the sequence", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    base.updateClient(ctx.client.id, { stage: "talking" });
    const swept = enrol.sweep();
    out({ swept, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.equal(result.enrolment.state, "stopped");
  assert.match(result.enrolment.stoppedReason, /conversation started/);
});

test("an address changed since enrolment stops the sequence rather than emailing the new one", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    base.updateClient(ctx.client.id, { email: "jane@newcompany.nl" });
    enrol.sweep();
    out(store.getEnrolment(ctx.enrolment.id));
  `);
  assert.equal(result.state, "stopped");
  assert.match(result.stoppedReason, /address changed/);
});

// --- staleness -------------------------------------------------------------

test("a step four days overdue is skipped rather than fired at somebody today", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    // Monday 08:00 local, with the step due the previous Wednesday.
    const now = new Date(2026, 7, 3, 9, 0, 0);
    store.updateEnrolment(ctx.enrolment.id, { dueAt: new Date(2026, 6, 29, 9, 0, 0).toISOString() });
    const tick = await runner.tick(now);
    out({ tick, sends: store.listSends(), enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.equal(result.tick.ran, true);
  assert.equal(result.sends[0].state, "skipped");
  assert.equal(result.sends[0].problem, "too late to be relevant");
  assert.equal(result.enrolment.stepIndex, 1, "and the one behind it is not blocked forever");
});

test("a tick outside the window sweeps but sends nothing", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    const saturday = new Date(2026, 7, 8, 11, 0, 0);
    out(await runner.tick(saturday));
  `);
  assert.equal(result.ran, true);
  assert.equal(result.sent, 0);
  assert.match(result.skipped, /Outside the sending window/);
});

// --- the files themselves --------------------------------------------------

test("the sequencer's files are written 0600, because of what is in them", () => {
  const result = inSandbox(`
    const fs = await import("node:fs");
    const ctx = enrolOne();
    suppress.suppress({ address: "someone@else.nl", reason: "bounced", by: "hook" });
    out({
      enrolments: (fs.statSync(store.SALESNAV_FILES.enrolments).mode & 0o777).toString(8),
      suppress: (fs.statSync(store.SALESNAV_FILES.suppress).mode & 0o777).toString(8),
    });
  `);
  assert.equal(result.enrolments, "600");
  assert.equal(result.suppress, "600");
});
