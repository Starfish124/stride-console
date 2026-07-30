// The Stride backend: the console and the agents, started together.
//
// Run: npm run backend
//
// This exists because "start the backend" should mean the whole thing is
// running, including the agents that keep the site optimised. Starting the
// console alone leaves a system that looks healthy and quietly stops improving.
//
// Both children inherit stdio, so one terminal shows both. If either dies the
// other is stopped too, so there is never a half-running backend that reports
// itself as up.

import { spawn } from "node:child_process";

const children = [];
let shuttingDown = false;

function start(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  child.on("close", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[backend] ${name} exited (code ${code}, signal ${signal ?? "none"}). Stopping the rest.`);
    stopAll(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(`[backend] ${name} failed to start: ${error.message}`);
    stopAll(1);
  });

  children.push({ name, child });
  return child;
}

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  // Give them a moment to close cleanly before the process leaves.
  setTimeout(() => process.exit(code), 500);
}

const mode = process.argv.includes("--dev") ? "dev" : "start";

console.log(`[backend] starting console (next ${mode}), the SEO agents and the email sequencer`);

// next start serves the built console; next dev is for working on it.
start("console", [
  "node_modules/next/dist/bin/next",
  mode,
]);
start("agents", ["scripts/agents.mjs"]);
// The sequencer's clock. It only ever calls the console over HTTP, so it is
// safe to lose: nothing sends while it is down, and nothing is half written.
// Note that a crash in it still stops the rest, per the rule above. That is
// deliberate for now, so a half-running backend never reports itself as up.
start("salesnav", ["scripts/salesnav-runner.mjs"]);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[backend] ${signal} received, shutting down`);
    stopAll(0);
  });
}
