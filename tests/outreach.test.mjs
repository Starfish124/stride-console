// Outreach: the gate on outbound messages, and the reply webhook.
//
// A post and a connection request fail differently. A post is judged on
// whether anyone stops scrolling; a message is judged by one person who can
// tell it went to four hundred others. These tests pin that difference.
//
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lintMessage, LIMITS } from "../lib/outreach/lint.ts";

const errorsFor = (result, rule) =>
  result.violations.filter((v) => v.rule === rule && v.severity === "error");

test("a connection note over LinkedIn's 300 characters is an error, not a preference", () => {
  const long = `Hi {first_name}, ${"we cut a review queue from 6 hours to 20 minutes. ".repeat(8)}`;
  const result = lintMessage(long, "connect", { isFirstTouch: true });
  assert.ok(long.length > LIMITS.connect.hard);
  assert.ok(errorsFor(result, "length").length > 0);
});

test("the mail-merge tells are refused", () => {
  for (const phrase of [
    "I hope this message finds you well",
    "I came across your profile",
    "I'd love to connect and explore synergies",
    "Just wanted to touch base",
  ]) {
    const result = lintMessage(`Hi {first_name}. ${phrase}.`, "message");
    assert.ok(errorsFor(result, "templateTells").length > 0, `missed: ${phrase}`);
  }
});

test("asking for the diary in the first touch is refused", () => {
  const result = lintMessage(
    "Hi {first_name}, saw you run ops at a wholesaler. Worth booking a call?",
    "connect",
    { isFirstTouch: true },
  );
  assert.ok(errorsFor(result, "prematurePitch").length > 0);
});

test("the same ask is allowed once it is not the opener", () => {
  const result = lintMessage(
    "You mentioned the invoice checking took 6 hours a week. Happy to book a call and walk you through what we did for a Lelystad wholesaler.",
    "message",
    { isFirstTouch: false },
  );
  assert.equal(errorsFor(result, "prematurePitch").length, 0);
});

test("a link before they have accepted reads as spam", () => {
  const result = lintMessage("Hi {first_name}, see https://stride.ai for more.", "connect", {
    isFirstTouch: true,
  });
  assert.ok(errorsFor(result, "links").length > 0);
});

test("the brand bans carry over from the post gate", () => {
  // One list, two gates: a word cut from the voice is cut from both at once.
  const result = lintMessage("Hi {first_name}, we help you leverage AI.", "message");
  assert.ok(errorsFor(result, "bannedWords").length > 0);
});

test("the AI tells carry over too", () => {
  const result = lintMessage(
    "Hi {first_name}, our tool serves as the front door for your invoices.",
    "message",
  );
  assert.ok(errorsFor(result, "ceremonyVerbs").length > 0);
});

test("hashtags, emoji and exclamation marks have no place in outbound", () => {
  assert.ok(errorsFor(lintMessage("Hi {first_name} #AI", "message"), "hashtags").length > 0);
  assert.ok(errorsFor(lintMessage("Hi {first_name} 🚀", "message"), "emoji").length > 0);
  assert.ok(errorsFor(lintMessage("Hi {first_name}, great news!", "message"), "exclamation").length > 0);
});

test("a message with no merge field warns that it is a broadcast", () => {
  const result = lintMessage("Hi there, we cut a review queue to 20 minutes.", "message");
  assert.ok(result.violations.some((v) => v.rule === "personalisation"));
});

test("an honest, specific opener passes clean", () => {
  const good =
    "Hi {first_name}, you run ops at a wholesaler in Lelystad. We got 6 hours a week back for a company that size by fixing one invoice check. Happy to send what we did if it is useful.";
  const result = lintMessage(good, "connect", { isFirstTouch: true });
  assert.equal(result.errors, 0, JSON.stringify(result.violations, null, 2));
});

// --- the reply webhook -----------------------------------------------------
//
// replies.ts writes to ./data, resolved from the working directory at import.
// These run in a throwaway directory so a test can never drop a fake reply
// into the founders' real inbox. (It did, once, before this was written.)

function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-outreach-"));
  try {
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `import * as m from ${JSON.stringify(MODULE)};\n${source}`],
      { cwd: dir, encoding: "utf8" },
    );
    return JSON.parse(out.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const MODULE = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "outreach", "replies.ts"),
).href;

test("a reply is read out of whatever shape Linked Helper posts", () => {
  const reply = inSandbox(`
    const r = m.recordReply({
      event: "replied",
      person: { first_name: "Jane", last_name: "Doe", headline: "Ops lead" },
      message: "Sure, send it over.",
      campaign_name: "MKB ops Q3",
    });
    console.log(JSON.stringify(r));
  `);

  assert.equal(reply.event, "replied");
  assert.equal(reply.name, "Jane Doe", "nested person data must be found");
  assert.equal(reply.headline, "Ops lead");
  assert.equal(reply.message, "Sure, send it over.");
  assert.equal(reply.campaign, "MKB ops Q3");
  assert.equal(reply.handled, false);
});

test("an unrecognised payload is kept rather than dropped", () => {
  // Losing a real reply because Linked Helper renamed a key would be the worst
  // failure this file can have, so the raw body always survives.
  const reply = inSandbox(`
    console.log(JSON.stringify(m.recordReply({ some_new_shape: { who: "nobody we know" } })));
  `);
  assert.deepEqual(reply.raw, { some_new_shape: { who: "nobody we know" } });
  assert.equal(reply.name, null);
});

test("the webhook secret is long enough not to be guessed, and stable", () => {
  const result = inSandbox(`
    const first = m.webhookSecret();
    console.log(JSON.stringify({
      length: first.length,
      matchesItself: m.secretMatches(first),
      matchesWrong: m.secretMatches("wrong"),
      matchesNull: m.secretMatches(null),
      stable: m.webhookSecret() === first,
    }));
  `);
  assert.ok(result.length >= 32, "the secret is the only guard on a public endpoint");
  assert.equal(result.matchesItself, true);
  assert.equal(result.matchesWrong, false);
  assert.equal(result.matchesNull, false);
  assert.equal(result.stable, true);
});
