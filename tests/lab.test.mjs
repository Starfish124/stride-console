// The lab's pure parts. Nothing here spawns the container CLI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRunning, validImage, validPort } from "../lib/lab/lab.ts";

test("parseRunning reads container 1.2.2's measured shape", () => {
  const json = JSON.stringify([
    { id: "lab-a", status: { state: "running", startedDate: "x" } },
    { id: "lab-b", status: { state: "stopped" } },
  ]);
  const names = parseRunning(json);
  assert.equal(names.has("lab-a"), true);
  assert.equal(names.has("lab-b"), false);
});

test("parseRunning tolerates a flat status string and garbage", () => {
  assert.equal(parseRunning('[{"id":"lab-c","status":"running"}]').has("lab-c"), true);
  assert.equal(parseRunning("not json").size, 0);
  assert.equal(parseRunning('{"id":"x"}').size, 0);
});

test("validImage accepts refs and rejects shell-ish input", () => {
  assert.equal(validImage("alpine:latest"), true);
  assert.equal(validImage("ghcr.io/org/img:1.2"), true);
  assert.equal(validImage("node"), true);
  assert.equal(validImage("img; rm -rf /"), false);
  assert.equal(validImage("img latest"), false);
  assert.equal(validImage(""), false);
});

test("validPort wants a real unprivileged port", () => {
  assert.equal(validPort(8080), true);
  assert.equal(validPort(80), false);
  assert.equal(validPort(70000), false);
  assert.equal(validPort("8080"), false);
  assert.equal(validPort(8080.5), false);
});
