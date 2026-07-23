// Headless pre-generation. launchd (or a founder) runs this Monday and
// Wednesday mornings so a draft waits in the console by breakfast.
// Run: npm run pregen            (recipe picked by weekday)
//      npm run pregen -- --recipe=tldr   (force a recipe on any day)
// Setup: docs/AUTOMATION.md. Safe to run twice — one draft per recipe per week.

import { pregen } from "../lib/pipeline/pregen.ts";

const forced = process.argv
  .find((a) => a.startsWith("--recipe="))
  ?.split("=")[1];
if (forced && forced !== "tldr" && forced !== "news") {
  console.error(`Unknown recipe "${forced}". Use tldr or news.`);
  process.exit(1);
}

const result = await pregen(new Date(), forced);
console.log(`[pregen] ${result.outcome}: ${result.message}`);
process.exit(result.outcome === "failed" ? 1 : 0);
