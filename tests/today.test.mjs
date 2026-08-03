import test from "node:test";
import assert from "node:assert/strict";

import { parseGitLog, startOfLocalDay } from "../lib/today.ts";

const US = "\x1f";

test("a commit subject containing commas and pipes stays one commit", () => {
  // The reason for unit separators. A comma-delimited format splits this
  // subject into three commits with a third of a message each, and every
  // conventional-commit subject in this repo contains a colon anyway.
  const raw = [
    `abc1234${US}2026-08-03T18:12:00+02:00${US}Sarvesh${US}seo: daily, twins, and Europe | measured`,
    `def5678${US}2026-08-03T09:01:00+02:00${US}Jort${US}content: sharpen the hero`,
  ].join("\n");

  const commits = parseGitLog(raw, "console");
  assert.equal(commits.length, 2);
  assert.equal(commits[0].subject, "seo: daily, twins, and Europe | measured");
  assert.equal(commits[0].sha, "abc1234");
  assert.equal(commits[0].author, "Sarvesh");
  assert.equal(commits[0].repo, "console");
});

test("empty output is no commits, not one blank one", () => {
  assert.deepEqual(parseGitLog("", "console"), []);
  assert.deepEqual(parseGitLog("\n  \n", "console"), []);
});

test("a malformed line is dropped rather than rendered half-empty", () => {
  const commits = parseGitLog(`onlyasha\nabc${US}2026-08-03T10:00:00Z${US}Sarvesh${US}real one`, "console");
  assert.deepEqual(commits.map((c) => c.subject), ["real one"]);
});

test("the day starts at local midnight, not UTC midnight", () => {
  // In CEST a UTC boundary cuts the day at 02:00, so a commit made at 00:30
  // would file itself under yesterday and the 03:15 sweep would land on the
  // wrong side of both.
  const at = new Date(2026, 7, 3, 0, 30, 0);
  const start = startOfLocalDay(at);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getDate(), 3);
  assert.ok(start.getTime() <= at.getTime(), "00:30 is after the day started");
});
