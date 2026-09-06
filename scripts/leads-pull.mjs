// The morning top-up of the lead book.
//
// Search costs nothing and each person revealed costs one credit, so the
// entire job is arranged around not spending: anyone already in the book is
// skipped for free, anyone Apollo has no address for is skipped for free, and
// the ceiling in data/apollo-icp.json bounds what is left. Set that ceiling to
// zero to pause the spend without unloading the schedule.
//
// Run by scripts/agents.mjs at 09:30 on weekdays. Safe to run by hand:
//   node --env-file-if-exists=.env.local scripts/leads-pull.mjs [--dry]

import { pullLeads, readIcp, apolloConfigured } from "../lib/apollo.ts";

const dry = process.argv.includes("--dry");
const log = (m) => console.log(`[leads ${new Date().toISOString()}] ${m}`);

if (!apolloConfigured()) {
  log("APOLLO_API_KEY is not set — nothing to do.");
  process.exit(0);
}

const icp = readIcp();
log(`ceiling ${icp.perRun}, titles ${icp.titles.length}, keywords ${icp.keywords.join("/")}`);

const r = await pullLeads({ dryRun: dry });

if (!r.ok) {
  log(`failed: ${r.problem}`);
  process.exit(1);
}

log(
  `pool ${r.pool}, already held ${r.alreadyHeld}, no address ${r.noEmail}, ` +
  `${dry ? "would reveal" : "revealed"} ${dry ? r.added : r.enriched}, added ${r.added}`,
);
if (r.problem) log(`stopped early: ${r.problem}`);

// Exit non-zero only on a real failure. Adding nobody is a perfectly good
// morning — it usually means the book already holds everyone the ICP matches,
// and a retry would search the same people again for the same nothing.
process.exit(r.problem ? 1 : 0);
