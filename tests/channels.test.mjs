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
import { parseAccountScreen } from "../bridge/lh.mjs";

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

test("parses the workspace id", () => {
  assert.equal(parseAccountScreen(ACCOUNT_SCREEN).workspace, "531684");
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
