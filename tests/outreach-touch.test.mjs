// The safety layer of the LinkedIn queue.
//
// Every case here is a way this thing could put a message in front of a founder
// that must never be sent, or put the same one there twice, or quietly stop
// putting anything there at all. The last one is the failure that shipped once
// already: the runner advanced straight past every LinkedIn step with "Linked
// Helper's job", so a sequence ran to completion having sent nothing and said
// nothing was wrong.
//
// Everything runs in a throwaway working directory. lib/store.ts resolves
// DATA_DIR from process.cwd() at import, so a careless test writes into the
// founders' live client book.

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
import * as touch from ${mod("lib/outreach/touch.ts")};
import * as queue from ${mod("lib/outreach/queue.ts")};
import * as store from ${mod("lib/salesnav/store.ts")};
import * as suppress from ${mod("lib/salesnav/suppress.ts")};
import * as enrol from ${mod("lib/salesnav/enrol.ts")};
import * as runner from ${mod("lib/salesnav/runner.ts")};

const BASIS = {
  kind: "legitimate-interest",
  reason: "Runs the warehouse at a wholesaler the size of the one we just finished with.",
  source: "Sales Navigator, NL wholesale list",
};

/** A note that passes the voice gate: personalised, no template tells, no pitch. */
const NOTE = "Hi {first_name}, you run ops at {company}. We just spent two days counting repetitive hours at a wholesaler your size and found 80 of them a week. Happy to send the method.";

const FOLLOW_UP = "Hi {first_name}, the write-up on those 80 hours is two pages and names where they went. Want it.";

function seed(overrides = {}, steps = null) {
  const client = base.addClient({
    name: "Jane Doe",
    company: "Acme Groothandel",
    stage: "lead",
    email: "jane@acme.nl",
    linkedin: "https://www.linkedin.com/in/jane-doe/",
    role: "ops lead",
    need: "invoice checking",
    ...overrides,
  });
  const sequence = sequences.saveSequence({
    name: "Wholesale opener",
    audience: "NL wholesale ops leads",
    steps: steps ?? [
      { kind: "connect", waitDays: 0, body: NOTE },
      { kind: "message", waitDays: 3, body: FOLLOW_UP },
    ],
  });
  return { client, sequence };
}

/** Enrol on a fixed clock, so a tick can be aimed at a known due time. */
function enrolAt(now, overrides, steps) {
  const { client, sequence } = seed(overrides, steps);
  const result = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh", now });
  if (!result.ok) throw new Error("enrol refused: " + result.problem);
  return { client, sequence, enrolment: result.enrolment };
}

function enrolOne(overrides, steps) {
  const { client, sequence } = seed(overrides, steps);
  const result = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });
  if (!result.ok) throw new Error("enrol refused: " + result.problem);
  return { client, sequence, enrolment: result.enrolment };
}

const out = (value) => console.log(JSON.stringify(value));
`;

/** Run a snippet with cwd in a fresh temp directory, and read its last line. */
function inSandbox(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-touch-"));
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

// --- the regression that started all of this ------------------------------

test("a LinkedIn step is queued for a person, not silently skipped", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    const attempt = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    out({
      attempt,
      pending: touch.pendingTouches(),
      enrolment: store.getEnrolment(ctx.enrolment.id),
    });
  `);

  assert.equal(result.attempt.outcome, "queued");
  assert.equal(result.pending.length, 1);
  const [queued] = result.pending;
  assert.equal(queued.kind, "connect");
  assert.equal(queued.profileUrl, "linkedin.com/in/jane-doe", "the profile is normalised on the way in");
  assert.ok(queued.text.startsWith("Hi Jane,"), "merge fields are resolved before a founder sees it");
  assert.ok(!queued.text.includes("{"), "nothing still wearing braces reaches the queue");
  assert.equal(queued.basis.reason.length >= 20, true, "the lawful basis is copied onto the touch");
  assert.equal(
    result.enrolment.stepIndex,
    0,
    "the sequence does not move past a message nobody has sent yet",
  );
});

test("the enrolment holds while a touch is pending, and moves once it is sent", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);

    const again = queue.queueTouch(store.getEnrolment(ctx.enrolment.id), ctx.sequence.steps[0], ctx.client);
    const held = store.getEnrolment(ctx.enrolment.id);

    const pending = touch.pendingTouches()[0];
    const settled = queue.settleTouch({
      id: pending.id,
      action: "done",
      by: "Jort",
      sequence: ctx.sequence,
      enrolment: store.getEnrolment(ctx.enrolment.id),
    });

    out({
      again,
      heldIndex: held.stepIndex,
      settled,
      after: store.getEnrolment(ctx.enrolment.id),
      pendingAfter: touch.pendingTouches().length,
      client: base.getClient(ctx.client.id),
    });
  `);

  assert.equal(result.again.outcome, "waiting", "a second tick does not queue a second copy");
  assert.equal(result.heldIndex, 0);
  assert.equal(result.settled.ok, true);
  assert.equal(result.settled.touch.state, "done");
  assert.equal(result.settled.touch.finishedBy, "Jort", "who said they sent it goes in the ledger");
  assert.equal(result.after.stepIndex, 1, "settling moves the sequence to the follow-up");
  assert.equal(result.pendingAfter, 0);
  assert.ok(
    result.client.touches.some((t) => /sent on LinkedIn/.test(t.note)),
    "the client record carries what was sent",
  );
});

test("the same step settled twice is refused rather than double-counted", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    const pending = touch.pendingTouches()[0];
    const args = { id: pending.id, action: "done", by: "Jort", sequence: ctx.sequence };

    const first = queue.settleTouch({ ...args, enrolment: store.getEnrolment(ctx.enrolment.id) });
    const second = queue.settleTouch({ ...args, enrolment: store.getEnrolment(ctx.enrolment.id) });

    out({ first, second, enrolment: store.getEnrolment(ctx.enrolment.id), all: touch.listTouches() });
  `);

  assert.equal(result.first.ok, true);
  assert.equal(result.second.ok, false);
  assert.match(result.second.problem, /already done/);
  assert.equal(result.enrolment.stepIndex, 1, "the second attempt does not advance the sequence again");
  assert.equal(result.all.length, 1, "one step, one record");
});

// --- the suppression list, across both channels ----------------------------

test("a suppressed profile is refused, and the enrolment stops rather than retrying", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    suppress.suppress({
      address: "https://nl.linkedin.com/in/Jane-Doe",
      reason: "blocked",
      by: "Sarvesh",
      channel: "linkedin",
    });
    const attempt = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    out({ attempt, enrolment: store.getEnrolment(ctx.enrolment.id), pending: touch.pendingTouches() });
  `);

  assert.equal(result.attempt.outcome, "refused");
  assert.match(result.attempt.detail, /suppression list \(blocked\)/);
  assert.equal(result.enrolment.state, "stopped", "never ask a second time");
  assert.equal(result.pending.length, 0, "nothing reaches a founder's thumb");
});

test("an email unsubscribe closes LinkedIn too", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    suppress.suppress({ address: "JANE@acme.nl", reason: "unsubscribed", by: "one-click" });
    const attempt = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    out({ attempt, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);

  assert.equal(result.attempt.outcome, "refused");
  assert.match(result.attempt.detail, /so LinkedIn is off too/);
  assert.equal(result.enrolment.state, "stopped");
});

test("unsubscribing cancels a touch already sitting in the queue", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    const before = touch.pendingTouches().length;

    suppress.suppress({ address: "jane@acme.nl", reason: "unsubscribed", by: "one-click" });

    out({ before, pending: touch.pendingTouches().length, all: touch.listTouches() });
  `);

  assert.equal(result.before, 1);
  assert.equal(result.pending, 0, "an opt-out that leaves a queued note is not an opt-out");
  assert.equal(result.all[0].state, "skipped");
  assert.match(result.all[0].problem, /Suppressed/);
});

// --- profiles we cannot check ----------------------------------------------

test("a Sales Navigator link is refused, because a suppression cannot be matched against it", () => {
  const result = inSandbox(`
    const client = base.addClient({
      name: "Jane Doe",
      company: "Acme Groothandel",
      stage: "lead",
      linkedin: "https://www.linkedin.com/sales/lead/ACwAAABc123,NAME_SEARCH,0Abc",
      role: "ops lead",
      need: "invoice checking",
    });
    const sequence = sequences.saveSequence({
      name: "Wholesale opener",
      audience: "NL wholesale ops leads",
      steps: [{ kind: "connect", waitDays: 0, body: NOTE }],
    });
    const attempt = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });
    out({ attempt });
  `);

  assert.equal(result.attempt.ok, false);
  assert.match(result.attempt.problem, /not a public profile URL|Sales Navigator/);
});

test("a client with no profile cannot be enrolled in a LinkedIn sequence", () => {
  const result = inSandbox(`
    const attempt = (() => {
      const client = base.addClient({ name: "Jane Doe", company: "Acme", stage: "lead", email: "jane@acme.nl", role: "ops lead", need: "x" });
      const sequence = sequences.saveSequence({
        name: "Connect only", audience: "x",
        steps: [{ kind: "connect", waitDays: 0, body: NOTE }],
      });
      return enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });
    })();
    out({ attempt });
  `);

  assert.equal(result.attempt.ok, false);
  assert.match(result.attempt.problem, /no LinkedIn profile/);
});

test("a LinkedIn-only sequence enrols without an email address", () => {
  const result = inSandbox(`
    const client = base.addClient({
      name: "Jane Doe", company: "Acme Groothandel", stage: "lead",
      linkedin: "linkedin.com/in/jane-doe", role: "ops lead", need: "invoice checking",
    });
    const sequence = sequences.saveSequence({
      name: "Connect only", audience: "x",
      steps: [{ kind: "connect", waitDays: 0, body: NOTE }],
    });
    const attempt = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });
    out({ attempt });
  `);

  assert.equal(result.attempt.ok, true, "Linked Helper is gone; a LinkedIn-only sequence has to run here");
  assert.equal(result.attempt.enrolment.email, "");
  assert.equal(result.attempt.enrolment.profileUrl, "linkedin.com/in/jane-doe");
});

test("one reply does not stop every LinkedIn sequence at once", () => {
  // The empty-email guard in hasReplied(). "".includes() is true of every
  // payload ever received, so without it the first reply from anybody would
  // sweep away every LinkedIn-only enrolment as "they replied".
  const result = inSandbox(`
    const replies = await import(${mod("lib/outreach/replies.ts")});
    const client = base.addClient({
      name: "Jane Doe", company: "Acme Groothandel", stage: "lead",
      linkedin: "linkedin.com/in/jane-doe", role: "ops lead", need: "invoice checking",
    });
    const sequence = sequences.saveSequence({
      name: "Connect only", audience: "x",
      steps: [{ kind: "connect", waitDays: 0, body: NOTE }],
    });
    const attempt = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });

    replies.recordReply({ name: "Someone Else", message: "not interested", profile_url: "https://linkedin.com/in/someone-else" });
    const swept = enrol.sweep();

    out({ swept, enrolment: store.getEnrolment(attempt.enrolment.id) });
  `);

  assert.equal(result.swept.stopped.length, 0, "somebody else's reply is not this person's reply");
  assert.equal(result.enrolment.state, "active");
});

test("a reply from the person themselves stops the sequence, matched on the profile", () => {
  const result = inSandbox(`
    const replies = await import(${mod("lib/outreach/replies.ts")});
    const client = base.addClient({
      name: "Someone Quite Different", company: "Acme Groothandel", stage: "lead",
      linkedin: "linkedin.com/in/jane-doe", role: "ops lead", need: "invoice checking",
    });
    const sequence = sequences.saveSequence({
      name: "Connect only", audience: "x",
      steps: [{ kind: "connect", waitDays: 0, body: NOTE }],
    });
    const attempt = enrol.enrol({ clientId: client.id, sequenceId: sequence.id, basis: BASIS, by: "Sarvesh" });

    replies.recordReply({ name: "someone with another name", message: "sure, send it", profile_url: "https://www.linkedin.com/in/jane-doe/" });
    const swept = enrol.sweep();

    out({ swept, enrolment: store.getEnrolment(attempt.enrolment.id) });
  `);

  assert.equal(result.swept.stopped.length, 1);
  assert.match(result.swept.stopped[0].reason, /replied/);
  assert.equal(result.enrolment.state, "stopped");
});

// --- the gates on the words themselves -------------------------------------

test("an unresolved merge field never reaches a founder", () => {
  const result = inSandbox(`
    const ctx = enrolOne({ role: undefined }, [
      { kind: "connect", waitDays: 0, body: "Hi {first_name}, you are {role} at {company} and I read the thing you wrote about picking errors." },
    ]);
    const attempt = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    out({ attempt, enrolment: store.getEnrolment(ctx.enrolment.id), pending: touch.pendingTouches() });
  `);

  assert.equal(result.attempt.outcome, "refused");
  assert.match(result.attempt.detail, /has no role/);
  assert.equal(result.enrolment.state, "stopped");
  assert.equal(result.pending.length, 0);
});

test("the voice gate refuses a template opener, and pauses rather than stops", () => {
  const result = inSandbox(`
    const ctx = enrolOne({}, [
      { kind: "connect", waitDays: 0, body: "Hi {first_name}, I hope this message finds you well. I came across your profile and would love to connect." },
    ]);
    const attempt = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    out({ attempt, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);

  assert.equal(result.attempt.outcome, "refused");
  assert.match(result.attempt.detail, /voice gate/);
  assert.equal(
    result.enrolment.state,
    "paused",
    "the copy can be fixed and the sequence resumed, so this is not a stop",
  );
});

test("a connection note over LinkedIn's own 300 characters is refused", () => {
  const result = inSandbox(`
    const long = "Hi {first_name}, you run ops at {company}. " + "We counted repetitive hours at a wholesaler your size and found eighty of them every week, which is two full people. ".repeat(3);
    const ctx = enrolOne({}, [{ kind: "connect", waitDays: 0, body: long }]);
    const attempt = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    out({ attempt });
  `);

  assert.equal(result.attempt.outcome, "refused");
  assert.match(result.attempt.detail, /LinkedIn refuses a connection note over 300/);
});

// --- the caps ---------------------------------------------------------------

test("the daily invitation cap holds the queue back without stopping the sequence", () => {
  const result = inSandbox(
    `
    const made = [];
    for (let i = 0; i < 3; i++) {
      const ctx = enrolOne({ name: "Person " + i, email: "p" + i + "@acme.nl", linkedin: "linkedin.com/in/person-" + i });
      made.push(queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client));
    }
    out({ made, pending: touch.pendingTouches().length, counts: queue.queueCounts() });
  `,
    { OUTREACH_INVITES_PER_DAY: "2" },
  );

  assert.equal(result.made[0].outcome, "queued");
  assert.equal(result.made[1].outcome, "queued");
  assert.equal(result.made[2].outcome, "refused", "the third is over the cap");
  assert.match(result.made[2].detail, /Today's 2 invitations are committed/);
  assert.equal(result.pending, 2);
});

test("a cap refusal leaves no record, so the step is retried rather than lost", () => {
  // The trap this guards: skipped and expired mean "settled, move on". Writing
  // a cap hit under the same key would turn "come back tomorrow" into "never".
  const result = inSandbox(
    `
    const ctx = enrolOne();
    const refused = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    const ledgerAfterRefusal = touch.listTouches().length;
    out({ refused, ledgerAfterRefusal });
  `,
    { OUTREACH_INVITES_PER_DAY: "0" },
  );

  assert.equal(result.refused.outcome, "refused");
  assert.equal(result.ledgerAfterRefusal, 0, "a transient refusal writes nothing at all");
});

test("pending invitations count against the cap, skipped ones give the slot back", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    const withPending = queue.queueCounts().invitesToday;

    const pending = touch.pendingTouches()[0];
    queue.settleTouch({
      id: pending.id, action: "skip", by: "Jort",
      sequence: ctx.sequence, enrolment: store.getEnrolment(ctx.enrolment.id),
    });
    const afterSkip = queue.queueCounts().invitesToday;

    out({ withPending, afterSkip, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);

  assert.equal(result.withPending, 1, "a message handed to a founder is committed");
  assert.equal(result.afterSkip, 0, "a slot passed on comes back");
  assert.equal(result.enrolment.stepIndex, 1, "skipping still moves the sequence on");
});

test("the weekly invitation cap is what the account actually gets restricted over", () => {
  const result = inSandbox(
    `
    const made = [];
    for (let i = 0; i < 3; i++) {
      const ctx = enrolOne({ name: "Person " + i, email: "p" + i + "@acme.nl", linkedin: "linkedin.com/in/person-" + i });
      made.push(queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client).outcome);
    }
    out({ made, counts: queue.queueCounts() });
  `,
    { OUTREACH_INVITES_PER_DAY: "50", OUTREACH_INVITES_PER_WEEK: "2" },
  );

  assert.deepEqual(result.made, ["queued", "queued", "refused"]);
  assert.equal(result.counts.invitesThisWeek, 2);
  assert.equal(result.counts.invitesSentThisWeek, 0, "queued is not sent, and the page says so");
});

test("messages to existing connections are capped separately from invitations", () => {
  const result = inSandbox(
    `
    const ctx = enrolOne({}, [{ kind: "message", waitDays: 0, body: FOLLOW_UP }]);
    const first = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);

    const ctx2 = enrolOne({ name: "Other Person", email: "o@acme.nl", linkedin: "linkedin.com/in/other" }, [
      { kind: "message", waitDays: 0, body: FOLLOW_UP },
    ]);
    const second = queue.queueTouch(ctx2.enrolment, ctx2.sequence.steps[0], ctx2.client);

    out({ first, second, counts: queue.queueCounts() });
  `,
    { OUTREACH_INVITES_PER_DAY: "0", OUTREACH_MESSAGES_PER_DAY: "1" },
  );

  assert.equal(result.first.outcome, "queued", "an invitation cap of zero does not block a message");
  assert.equal(result.second.outcome, "refused");
  assert.match(result.second.detail, /Today's 1 messages are committed/);
});

// --- the stop switch --------------------------------------------------------

test("the hard stop covers LinkedIn, not just email", () => {
  const result = inSandbox(`
    const ctx = enrolOne();
    store.setHardStop({ stopped: true, by: "Jort", reason: "Pausing everything before the holiday." });
    const attempt = queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    out({ attempt, pending: touch.pendingTouches().length, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);

  assert.equal(result.attempt.outcome, "refused");
  assert.match(result.attempt.detail, /All outreach is stopped/);
  assert.equal(result.pending, 0);
  assert.equal(result.enrolment.state, "active", "the stop is a pause, not a cancellation");
});

// --- expiry -----------------------------------------------------------------

test("a touch nobody sent expires, and the sequence moves past it", () => {
  const result = inSandbox(
    `
    const ctx = enrolOne();
    queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);

    const later = new Date(Date.now() + 9 * 86400000);
    const expired = queue.expireStaleTouches(later, (id) => {
      const e = store.getEnrolment(id);
      return e ? { enrolment: e, sequence: ctx.sequence } : undefined;
    });

    out({ expired, pending: touch.pendingTouches().length, enrolment: store.getEnrolment(ctx.enrolment.id) });
  `,
    { OUTREACH_TOUCH_EXPIRE_DAYS: "5" },
  );

  assert.equal(result.expired.length, 1);
  assert.equal(result.expired[0].state, "expired");
  assert.match(result.expired[0].problem, /stale/);
  assert.equal(result.pending, 0);
  assert.equal(result.enrolment.stepIndex, 1, "an unworked queue must not freeze a sequence forever");
});

test("an expired invitation does not keep consuming the weekly cap", () => {
  const result = inSandbox(
    `
    const ctx = enrolOne();
    queue.queueTouch(ctx.enrolment, ctx.sequence.steps[0], ctx.client);
    const before = queue.queueCounts().invitesThisWeek;

    const later = new Date(Date.now() + 9 * 86400000);
    queue.expireStaleTouches(later, (id) => {
      const e = store.getEnrolment(id);
      return e ? { enrolment: e, sequence: ctx.sequence } : undefined;
    });

    out({ before, after: queue.queueCounts(later).invitesThisWeek });
  `,
    { OUTREACH_TOUCH_EXPIRE_DAYS: "5" },
  );

  assert.equal(result.before, 1);
  assert.equal(result.after, 0);
});

// --- the runner, end to end -------------------------------------------------

test("a tick queues the LinkedIn step and reports it, instead of skipping it silently", () => {
  const result = inSandbox(`
    // Mid-morning on a Wednesday, inside the default 08:00-17:30 window. The
    // enrolment is dated too, because nextDueAt adds up to 37 minutes of
    // jitter and a tick before that is simply not due yet.
    const enrolledAt = new Date("2026-09-02T09:00:00");
    const ctx = enrolAt(enrolledAt);
    const tick = await runner.tick(new Date("2026-09-02T10:00:00"));
    out({ tick, pending: touch.pendingTouches(), enrolment: store.getEnrolment(ctx.enrolment.id) });
  `);

  assert.equal(result.tick.ran, true);
  assert.equal(result.tick.queued, 1, "the tick reports what it put in front of a person");
  assert.equal(result.tick.sent, 0, "nothing was sent by a machine");
  assert.equal(result.pending.length, 1);
  assert.equal(result.enrolment.stepIndex, 0, "the sequence waits on the founder");
  assert.ok(
    result.tick.lines.some((l) => /queued/.test(l)),
    "the log says what happened, so a dead channel cannot look like a working one",
  );
});

test("a second tick does not queue the same step twice", () => {
  const result = inSandbox(`
    enrolAt(new Date("2026-09-02T09:00:00"));
    const first = await runner.tick(new Date("2026-09-02T10:00:00"));
    const second = await runner.tick(new Date("2026-09-02T10:01:00"));
    out({ first: { queued: first.queued, waiting: first.waiting }, second: { queued: second.queued, waiting: second.waiting }, all: touch.listTouches().length });
  `);

  assert.equal(result.first.queued, 1);
  assert.equal(result.second.queued, 0);
  assert.equal(result.second.waiting, 1, "the second tick sees it waiting on a person");
  assert.equal(result.all, 1);
});

// --- profile normalisation --------------------------------------------------

test("profile URLs normalise to one form, and Sales Navigator links to none", () => {
  const result = inSandbox(`
    const forms = [
      "https://www.linkedin.com/in/jane-doe/",
      "http://linkedin.com/in/jane-doe",
      "https://nl.linkedin.com/in/jane-doe?originalSubdomain=nl",
      "LINKEDIN.COM/IN/Jane-Doe",
      "linkedin.com/in/jane-doe#experience",
    ].map(suppress.normaliseProfileUrl);

    const rejected = [
      "https://www.linkedin.com/sales/lead/ACwAAABc123,NAME_SEARCH,0Abc",
      "https://www.linkedin.com/company/acme",
      "jane-doe",
      "",
    ].map(suppress.normaliseProfileUrl);

    out({ forms, rejected });
  `);

  assert.deepEqual(
    result.forms,
    Array(5).fill("linkedin.com/in/jane-doe"),
    "every spelling of a profile is the same profile",
  );
  assert.deepEqual(result.rejected, ["", "", "", ""], "anything we cannot check is refused, never guessed");
});
