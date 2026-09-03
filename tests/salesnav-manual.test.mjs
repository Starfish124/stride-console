// The LinkedIn steps, which no machine here sends.
//
// The bug this file exists to keep dead: the runner used to advance past a
// LinkedIn step because Linked Helper owned it. Without Linked Helper that
// means a sequence walks to "done" having sent nothing on LinkedIn and reports
// itself finished. Every test below is a way that could come back.
//
// Same sandbox discipline as tests/salesnav.test.mjs: lib/store.ts resolves
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
import * as base from ${mod("lib/store.ts")};
import * as sequences from ${mod("lib/outreach/sequence.ts")};
import * as store from ${mod("lib/salesnav/store.ts")};
import * as enrol from ${mod("lib/salesnav/enrol.ts")};
import * as manual from ${mod("lib/salesnav/manual.ts")};
import * as runner from ${mod("lib/salesnav/runner.ts")};

const BASIS = {
  kind: "legitimate-interest",
  reason: "Met at the Lelystad ops meetup and asked for the invoice write-up.",
  source: "Lelystad ops meetup, June",
};

/** Monday 2026-08-03, inside the default window. */
const MONDAY = new Date(2026, 7, 3, 9, 0, 0);
const LATER = new Date(2026, 7, 3, 11, 0, 0);

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

/** A connect step first, then an email, so the hold blocks something visible. */
function seq(steps) {
  return sequences.saveSequence({
    name: "LinkedIn first",
    audience: "NL groothandel ops leads",
    steps: steps ?? [
      { kind: "connect", waitDays: 0, body: "{first_name}, you run {role} at {company}. We got six hours a week back for a company that size by fixing one invoice check." },
      { kind: "email", waitDays: 2, subject: "the write-up for {company}", body: "Hi {first_name}, two pages. Want it." },
    ],
  });
}

function enrolOne(overrides = {}, steps) {
  const c = client(overrides);
  const s = seq(steps);
  const result = enrol.enrol({ clientId: c.id, sequenceId: s.id, basis: BASIS, by: "Sarvesh", now: MONDAY });
  return { client: c, sequence: s, result, enrolment: result.enrolment };
}

const out = (value) => console.log(JSON.stringify(value));
`;

function inSandbox(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-manual-"));
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

// --- the hold --------------------------------------------------------------

test("a LinkedIn step waits for a person and does not walk the sequence forward", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    const tick = await runner.tick(LATER);
    out({ tick, waiting: manual.waitingManualSteps(), enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);

  assert.equal(result.tick.ran, true);
  assert.equal(result.tick.sent, 0, "nothing is sent for a LinkedIn step");
  assert.equal(result.tick.waiting, 1);
  assert.equal(result.enrolment.stepIndex, 0, "the enrolment holds on the step nobody has sent");
  assert.equal(result.enrolment.state, "active", "and is never reported finished");

  const [queued] = result.waiting;
  assert.equal(queued.kind, "connect");
  assert.equal(queued.state, "waiting");
  assert.ok(queued.body.startsWith("Jane, you run ops lead at Acme BV"), "the words are merged, ready to copy");
  assert.equal(queued.profileUrl, "https://www.linkedin.com/in/janedoe");
  assert.ok(queued.basis.reason.length >= 20, "the lawful basis is copied onto the queued step");
});

test("ticking twice queues one row, not two", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    await runner.tick(LATER);
    const second = await runner.tick(new Date(2026, 7, 3, 12, 0, 0));
    out({ second, all: manual.listManualSteps() });
  `);
  assert.equal(result.all.length, 1, "the key is the enrolment and the step, so a re-tick is a no-op");
  assert.equal(result.second.waiting, 1);
});

// --- working the queue -----------------------------------------------------

test("marking one sent advances the sequence and lands on the person's record", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    await runner.tick(LATER);
    const [queued] = manual.waitingManualSteps();
    const done = manual.completeManual(queued.key, "Jort", LATER);
    out({ done, enrolment: store.getEnrolment(ctx.enrolment.id), client: base.getClient(ctx.client.id) });
  `);

  assert.equal(result.done.state, "done");
  assert.equal(result.done.finishedBy, "Jort");
  assert.equal(result.enrolment.stepIndex, 1, "only a person saying so moves the sequence on");
  assert.equal(result.enrolment.state, "active");
  assert.match(result.client.touches[0].note, /LinkedIn connection note sent by hand/);
  assert.equal(result.client.touches[0].who, "Jort");
});

test("skipping records why, and still lets the sequence continue", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    await runner.tick(LATER);
    const [queued] = manual.waitingManualSteps();
    const skipped = manual.skipManual(queued.key, "Jort", "Already connected with him.", LATER);
    out({ skipped, enrolment: store.getEnrolment(ctx.enrolment.id), waiting: manual.waitingManualSteps() });
  `);
  assert.equal(result.skipped.state, "skipped");
  assert.equal(result.skipped.problem, "Already connected with him.");
  assert.equal(result.enrolment.stepIndex, 1);
  assert.deepEqual(result.waiting, [], "and it leaves the queue");
});

test("a step already worked cannot be worked twice", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    await runner.tick(LATER);
    const [queued] = manual.waitingManualSteps();
    manual.completeManual(queued.key, "Jort", LATER);
    const again = manual.completeManual(queued.key, "Sarvesh", LATER);
    out({ again: again ?? null, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.equal(result.again, null, "a second click is refused, not applied");
  assert.equal(result.enrolment.stepIndex, 1, "and the sequence does not skip a step because of it");
});

// --- the merge-field trap --------------------------------------------------

test("an unresolved merge field holds the step instead of queueing {first_name}", () => {
  const result = inSandbox(`
    const ctx = enrolOne({ role: undefined });
    const tick = await runner.tick(LATER);
    out({ tick, waiting: manual.waitingManualSteps(), enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.deepEqual(result.waiting, [], "nothing a founder could paste half-merged");
  assert.match(result.tick.lines[0], /connect held, Jane Doe has no role/);
  assert.equal(result.enrolment.stepIndex, 0, "the step is held, not lost");
});

test("filling the field in queues the same step on the next tick", () => {
  const result = inSandbox(`
    const ctx = enrolOne({ role: undefined });
    await runner.tick(LATER);
    base.updateClient(ctx.client.id, { role: "ops lead" });
    const tick = await runner.tick(new Date(2026, 7, 3, 12, 0, 0));
    out({ tick, waiting: manual.waitingManualSteps() });
  `);
  assert.equal(result.waiting.length, 1);
  assert.ok(result.waiting[0].body.includes("ops lead"));
});

// --- what a LinkedIn-only sequence needs -----------------------------------

test("a LinkedIn-only sequence can now be enrolled, and needs a profile rather than an address", () => {
  const only = [{ kind: "connect", waitDays: 0, body: "{first_name}, you run {role} at {company}. One invoice check, six hours a week." }];

  const withProfile = inSandbox(`
    const ctx = enrolOne({ email: undefined }, ${JSON.stringify(only)});
    out({ ok: ctx.result.ok, problem: ctx.result.problem ?? null });
  `);
  assert.equal(withProfile.ok, true, "no email address is fine when nothing emails");

  const without = inSandbox(`
    const ctx = enrolOne({ linkedin: undefined }, ${JSON.stringify(only)});
    out({ ok: ctx.result.ok, problem: ctx.result.problem ?? null });
  `);
  assert.equal(without.ok, false);
  assert.match(without.problem, /no LinkedIn profile/);
});

test("an address-less enrolment does not read every reply in the inbox as its own", () => {
  const only = [{ kind: "connect", waitDays: 0, body: "{first_name}, one invoice check at {company}." }];
  const result = inSandbox(`
    const ctx = enrolOne({ email: undefined }, ${JSON.stringify(only)});
    const replies = await import(${mod("lib/outreach/replies.ts")});
    replies.recordReply({ name: "Someone Else", raw: "not from her at all" });
    const swept = enrol.sweep();
    out({ swept, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.deepEqual(result.swept.stopped, [], "an empty address matches nothing, not everything");
  assert.equal(result.enrolment.state, "active");
});

// --- staleness -------------------------------------------------------------

test("a queued step nobody got to is settled by the too-late rule, not left waiting for good", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    await runner.tick(LATER);
    store.updateEnrolment(ctx.enrolment.id, { dueAt: new Date(2026, 6, 29, 9, 0, 0).toISOString() });
    const tick = await runner.tick(new Date(2026, 7, 3, 13, 0, 0));
    out({ tick, all: manual.listManualSteps(), enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);
  assert.equal(result.all[0].state, "skipped");
  assert.equal(result.all[0].problem, "too late to be relevant");
  assert.equal(result.enrolment.stepIndex, 1, "and the step behind it is not blocked forever");
});
