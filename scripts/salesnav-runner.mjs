// The email sequencer's clock, and nothing else.
//
// Run: npm run salesnav        (the clock alone)
//      npm run backend         (console, SEO agents and this, together)
//      node scripts/salesnav-runner.mjs --once    one tick, then exit
//      node scripts/salesnav-runner.mjs --stop    stop all sending, then exit
//
// This process never writes data/. Every tick it mints the session cookie and
// asks the console to run one tick over HTTP, and the console does all the
// writing. That single decision removes a whole class of bug: two founders and
// a background job cannot clobber clients.json, because there is only ever one
// writer, and Node is single threaded inside it.
//
// The cost, stated plainly: while the console is down, nothing sends. That is
// the correct failure rather than a clever one, and it is logged every minute
// so a paused sequencer is never silent.
//
// It holds its own clock instead of trusting launchd, for the same reason
// scripts/agents.mjs does: this Mac sleeps, and a calendar job that fires
// while asleep is simply missed. Catch-up is inherent here, because dueAt is
// an instant. After a wake everything overdue is simply due, and then bounded
// by the sending window, the per-tick maximum and the staleness rule.

import fs from "node:fs";
import path from "node:path";
import { getPassword, sessionToken } from "../lib/auth.ts";

const TICK_MS = 60_000;
const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "salesnav-state.json");
const STOP_FILE = path.join(DATA_DIR, "salesnav-stop.json");

const CONSOLE_URL = (process.env.SALESNAV_CONSOLE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

function log(message) {
  console.log(`[salesnav ${new Date().toISOString()}] ${message}`);
}

function writeAtomic(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * The stop switch, written straight to disk.
 *
 * Deliberately not an HTTP call: the one moment somebody needs to stop cold
 * email in a hurry is quite likely the moment the console is wedged.
 */
function stopEverything() {
  writeAtomic(STOP_FILE, {
    stopped: true,
    at: new Date().toISOString(),
    by: "runner --stop",
    reason: "Stopped from the command line.",
  });
  log(`all sending stopped. Resume from /salesnav, which needs a confirmation.`);
}

async function runTick() {
  let token;
  try {
    token = await sessionToken(getPassword());
  } catch (error) {
    log(`could not mint a session cookie: ${error.message}`);
    return;
  }

  try {
    const res = await fetch(`${CONSOLE_URL}/api/salesnav/run`, {
      method: "POST",
      headers: { cookie: `stride_session=${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      log("a tick was already running, skipped");
      return;
    }
    if (!res.ok) {
      log(`the console answered ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      return;
    }
    if (!body.ran) {
      if (body.skipped) log(body.skipped);
      return;
    }
    log(`${body.mode}: ${body.due} due, ${body.sent} sent, ${body.refused} refused, ${body.stopped} stopped`);
    for (const line of body.lines ?? []) log(`  ${line}`);
    writeAtomic(STATE_FILE, { lastTickAt: new Date().toISOString() });
  } catch (error) {
    // Nothing sends while the console is down. Say so, every minute, rather
    // than looking healthy and quietly sending nothing.
    log(`the console is out of reach at ${CONSOLE_URL}, nothing sent: ${error.message}`);
  }
}

if (process.argv.includes("--stop")) {
  stopEverything();
} else if (process.argv.includes("--once")) {
  await runTick();
} else {
  log(`clock started, one tick a minute against ${CONSOLE_URL}`);
  await runTick();
  setInterval(runTick, TICK_MS);
}
