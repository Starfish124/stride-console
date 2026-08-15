// The agent supervisor. Starting the Stride backend starts this, so the site
// keeps working on itself without anybody remembering to run anything.
//
// Run: npm run agents          (supervisor alone)
//      npm run backend         (console and supervisor together)
//
// It holds its own clock rather than delegating to launchd, for two reasons.
// The Mac sleeps, and a launchd calendar job that fires while asleep is simply
// missed; this catches up on wake instead. And a single long-lived process
// keeps the schedule, the catch-up logic and the logging in one file that can
// be read top to bottom.
//
// Schedule, local time:
//   03:15 daily    sweep     discovery, audit, metadata fixes
//   07:40 daily    articles  draft the top gap, then notify the phones
//
// Both runs are idempotent, so a catch-up after a long sleep is safe.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const STATE_FILE = path.join(process.cwd(), "data", "seo-agent-state.json");
const TICK_MS = 60_000;

const JOBS = [
  {
    name: "sweep",
    script: "scripts/seo-sweep.mjs",
    hour: 3,
    minute: 15,
    // Every day.
    days: [0, 1, 2, 3, 4, 5, 6],
    // If the Mac was asleep at 03:15, still run it any time up to this hour.
    catchUpUntilHour: 12,
  },
  {
    // One article a day, not three on a Monday. Google reads a steady
    // publishing rhythm, and a founder can actually read one a day. It runs
    // after the sweep so the brief queue is already fresh.
    name: "articles",
    script: "scripts/seo-articles.mjs",
    hour: 7,
    minute: 40,
    days: [0, 1, 2, 3, 4, 5, 6],
    catchUpUntilHour: 20,
  },
  {
    // The knowledge graph. Costs nothing but a few seconds of CPU — the code
    // extraction is tree-sitter and calls no API — so it can simply run every
    // night and pick up the day's sessions and commits.
    name: "graph",
    script: "scripts/graph-build.mjs",
    hour: 4,
    minute: 30,
    days: [0, 1, 2, 3, 4, 5, 6],
    catchUpUntilHour: 23,
  },
  {
    // Hermes, the memory keeper: distils the day's sessions and delivery runs
    // into durable memories and diffs the business stores into a timeline.
    // Runs after the graph build so the newest session notes are on disk.
    // Claude calls are capped per night inside the script.
    name: "brain",
    script: "scripts/brain-distill.mjs",
    hour: 5,
    minute: 0,
    days: [0, 1, 2, 3, 4, 5, 6],
    catchUpUntilHour: 23,
  },
];

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

function localDay(date) {
  // Local calendar day, not UTC. A 03:15 job must key off the day it is
  // locally, or every run between midnight and 02:00 CEST records itself
  // against yesterday and fires twice.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function log(message) {
  console.log(`[agents ${new Date().toISOString()}] ${message}`);
}

/** Whether a job is due now and has not already run for this period. */
export function isDue(job, now, state) {
  if (!job.days.includes(now.getDay())) return false;

  const afterStart =
    now.getHours() > job.hour ||
    (now.getHours() === job.hour && now.getMinutes() >= job.minute);
  if (!afterStart) return false;

  // The catch-up window closes so a machine woken at 23:00 does not start a
  // sweep nobody will see, right before the next one is due anyway.
  if (now.getHours() >= job.catchUpUntilHour) return false;

  return state[job.name]?.lastRunDay !== localDay(now);
}

function run(job) {
  return new Promise((resolve) => {
    log(`starting ${job.name}`);
    const child = spawn(process.execPath, [job.script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Sonnet is the right tier for this work and keeps overnight runs
        // cheap. Override with CLAUDE_CLI_MODEL if a run needs more.
        CLAUDE_CLI_MODEL: process.env.CLAUDE_CLI_MODEL ?? "sonnet",
      },
      stdio: "inherit",
    });
    child.on("close", (code) => {
      log(`${job.name} exited ${code}`);
      resolve(code ?? 1);
    });
    child.on("error", (error) => {
      log(`${job.name} failed to start: ${error.message}`);
      resolve(1);
    });
  });
}

let running = false;

async function tick() {
  // One job at a time. Both hit the Claude CLI and the same JSON store, and
  // overlapping runs would race on data/.
  if (running) return;

  const now = new Date();
  const state = readState();

  for (const job of JOBS) {
    if (!isDue(job, now, state)) continue;
    running = true;
    try {
      const code = await run(job);
      state[job.name] = {
        lastRunDay: localDay(now),
        lastRunAt: now.toISOString(),
        lastExitCode: code,
      };
      writeState(state);
    } finally {
      running = false;
    }
    // Only one job per tick, so a slow sweep never delays the next check.
    break;
  }
}

// Manual trigger: `npm run agents -- --now=sweep` runs a job immediately and
// exits, which is how you test the wiring without waiting for 03:15.
const nowArg = process.argv.slice(2).find((a) => a.startsWith("--now="));
if (nowArg) {
  const name = nowArg.split("=")[1];
  const job = JOBS.find((j) => j.name === name);
  if (!job) {
    console.error(`Unknown job "${name}". Known jobs: ${JOBS.map((j) => j.name).join(", ")}`);
    process.exit(1);
  }
  const code = await run(job);
  process.exit(code);
}

log(
  `supervisor up. ${JOBS.map((j) => `${j.name} at ${String(j.hour).padStart(2, "0")}:${String(j.minute).padStart(2, "0")}`).join(", ")}`,
);

const state = readState();
for (const job of JOBS) {
  const last = state[job.name]?.lastRunAt;
  log(`  ${job.name}: last run ${last ?? "never"}`);
}

await tick();
setInterval(() => {
  tick().catch((error) => log(`tick failed: ${error.message}`));
}, TICK_MS);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`${signal} received, stopping`);
    process.exit(0);
  });
}
