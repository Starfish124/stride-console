// Voice in and voice out, the parts that are pure. Run: npm test
//
// The spawn paths (ffmpeg, whisper-cli, the Kokoro server) are checked by hand
// against the real binaries; what is pinned here is the logic that decides
// where a sentence ends and whether anything was said at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSpeakable } from "../lib/speech/kokoro.ts";
import { cleanTranscript } from "../lib/speech/whisper.ts";

test("a finished sentence is ready to speak, an unfinished one waits", () => {
  const { ready, rest } = splitSpeakable("Four campaigns exist. One is run");
  assert.deepEqual(ready, ["Four campaigns exist."]);
  assert.equal(rest, " One is run");
});

test("the last sentence is held until something follows it", () => {
  // Mid-stream the model may still be writing; speaking a sentence that is
  // about to grow a clause is worse than waiting one chunk.
  const { ready, rest } = splitSpeakable("Nothing can send yet.");
  assert.deepEqual(ready, []);
  assert.equal(rest, "Nothing can send yet.");
});

test("a company name is not a sentence break", () => {
  // Durabo B.V. and HIT Trading B.V. are both really in the client book, so
  // this is the case that breaks the naive splitter.
  const { ready, rest } = splitSpeakable("Durabo B.V. is talking. HIT Trading B.V. is a client. ");
  assert.deepEqual(ready, ["Durabo B.V. is talking.", "HIT Trading B.V. is a client."]);
  assert.equal(rest.trim(), "");
});

test("a decimal is not a sentence break", () => {
  const { ready } = splitSpeakable("The score is 72.5 out of 100. Nine pages were checked. ");
  assert.deepEqual(ready, ["The score is 72.5 out of 100.", "Nine pages were checked."]);
});

test("streaming a chunk at a time speaks every sentence exactly once", () => {
  const answer =
    "Five people are in the book. Durabo B.V. is talking. Nobody is owed a reply right now. ";
  const spoken = [];
  let buffer = "";
  // Three characters at a time, the worst case a network chunk can do.
  for (let i = 0; i < answer.length; i += 3) {
    buffer += answer.slice(i, i + 3);
    const { ready, rest } = splitSpeakable(buffer);
    spoken.push(...ready);
    buffer = rest;
  }
  assert.deepEqual(spoken, [
    "Five people are in the book.",
    "Durabo B.V. is talking.",
    "Nobody is owed a reply right now.",
  ]);
});

test("silence is reported as silence, not as a question", () => {
  // Measured: two seconds of digital silence through ggml-base.en returns
  // "\n you". Passing that on would ask the model about "you".
  assert.equal(cleanTranscript("\n you"), "");
  assert.equal(cleanTranscript(" [BLANK_AUDIO]"), "");
  assert.equal(cleanTranscript("Thank you."), "");
  assert.equal(cleanTranscript("   "), "");
});

test("real speech survives cleaning", () => {
  assert.equal(cleanTranscript("\n What needs me today?"), "What needs me today?");
  // "you" alone is silence; "you" inside a question is not.
  assert.equal(cleanTranscript(" What did you say about Durabo?"), "What did you say about Durabo?");
});
