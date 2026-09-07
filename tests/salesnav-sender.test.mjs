// Two founders can send from the sequencer. The one property that matters:
// Jort's identity is never a silent fallback to Sarvesh's, or vice versa.

import test from "node:test";
import assert from "node:assert/strict";

import { envelope } from "../lib/salesnav/provider.ts";

function withEnv(vars, fn) {
  const before = {};
  for (const k of Object.keys(vars)) before[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

test("no sender, or sender: sarvesh, uses SALESNAV_FROM", () => {
  withEnv(
    { SALESNAV_FROM: "Sarvesh Singh <sarvesh@stride-ai.nl>", SALESNAV_REPLY_TO: "sarvesh@stride-ai.nl", SALESNAV_FROM_JORT: "", SALESNAV_REPLY_TO_JORT: "" },
    () => {
      assert.deepEqual(envelope(), { from: "Sarvesh Singh <sarvesh@stride-ai.nl>", replyTo: "sarvesh@stride-ai.nl" });
      assert.deepEqual(envelope("sarvesh"), { from: "Sarvesh Singh <sarvesh@stride-ai.nl>", replyTo: "sarvesh@stride-ai.nl" });
    },
  );
});

test("sender: jort uses SALESNAV_FROM_JORT, not SALESNAV_FROM", () => {
  withEnv(
    {
      SALESNAV_FROM: "Sarvesh Singh <sarvesh@stride-ai.nl>",
      SALESNAV_REPLY_TO: "sarvesh@stride-ai.nl",
      SALESNAV_FROM_JORT: "Jort Hubers <jort@stride-ai.nl>",
      SALESNAV_REPLY_TO_JORT: "jort@stride-ai.nl",
    },
    () => {
      assert.deepEqual(envelope("jort"), { from: "Jort Hubers <jort@stride-ai.nl>", replyTo: "jort@stride-ai.nl" });
    },
  );
});

test("a jort sequence never sends as Sarvesh when SALESNAV_FROM_JORT is unset", () => {
  withEnv({ SALESNAV_FROM: "Sarvesh Singh <sarvesh@stride-ai.nl>", SALESNAV_FROM_JORT: "", SALESNAV_REPLY_TO_JORT: "" }, () => {
    const { from } = envelope("jort");
    assert.notEqual(from, "Sarvesh Singh <sarvesh@stride-ai.nl>", "must not fall back to the other founder's address");
    assert.equal(from, "Stride <dry-run@localhost>", "falls back to the loud, obviously-broken default instead");
  });
});
