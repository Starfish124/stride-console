// The daily SEO sweep. Discover keywords, pull Search Console numbers, audit
// every live page, apply the fixes that are safe to apply, queue the gaps.
//
// Run: npm run seo:sweep
//      npm run seo:sweep -- --shallow      (skip the alphabet pass)
//      npm run seo:sweep -- --dry-run      (propose changes, write nothing)
//      npm run seo:sweep -- --origin=http://localhost:3000
//
// Safe to run twice. Keywords merge, audits overwrite, and a metadata change
// only applies when the value still matches what was audited.

import { dailySweep } from "../lib/seo/agent.ts";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const result = await dailySweep({
  shallow: flag("shallow"),
  dryRun: flag("dry-run"),
  originOverride: value("origin"),
});

console.log(`[seo-sweep] ${result.outcome}: ${result.message}`);

if (result.changesProposed.length > 0) {
  console.log(`\n[seo-sweep] metadata changes:`);
  for (const c of result.changesProposed) {
    console.log(`  ${c.appliedAt ? "applied" : "proposed"} ${c.route} (${c.locale}) ${c.field}`);
    console.log(`    before: ${c.before}`);
    console.log(`    after:  ${c.after}`);
  }
}

if (result.findings.length > 0) {
  console.log(`\n[seo-sweep] ${result.findings.length} high-severity findings:`);
  for (const f of result.findings.slice(0, 20)) {
    console.log(`  [${f.severity}] ${f.route}: ${f.detail}`);
  }
}

// The feed parser and fetch keep-alives hold the loop open. The work is done,
// so say so and leave rather than hanging a launchd job for its timeout.
process.exit(result.outcome === "failed" ? 1 : 0);
