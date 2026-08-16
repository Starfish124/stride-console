// The weekly article batch. Writes articles for the highest-opportunity gaps
// the sweep queued, and publishes the ones that come out clean.
//
// The voice gate is what decides, not whether anyone was watching: a draft
// with zero errors goes straight to the site, and anything the gate flags
// stays on /seo for a person to read and fix. Set autoPublishArticles to
// false in the config to make every article wait for the button again.
//
// Measured demand decides what gets written FIRST — that is the demand gate.
// What it no longer decides is whether anything gets written at all: an article
// a day is a standing rule, so when the gate holds everything, the floor
// (minPublishedPerRun) falls back to the best brief that still passes the geo
// hold, the discovery filters and the voice gate. A day that publishes nothing
// exits non-zero and the supervisor tries again.
//
// Run: npm run seo:articles
//      npm run seo:articles -- --limit=1
//      npm run seo:articles -- --ignore-demand    (write on the score alone)
//      npm run seo:articles -- --only="ai automation agency cost"   (repeatable)
//
// --only is the human's pick. --ignore-demand alone writes the top of a guessed
// ranking, which is not the same thing as writing the best briefs; naming them
// is how somebody chooses three without changing what the 07:40 run does.

import { draftArticles } from "../lib/seo/agent.ts";
import { listPushSubs } from "../lib/store.ts";

const limitArg = process.argv.slice(2).find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

const only = process.argv
  .slice(2)
  .filter((a) => a.startsWith("--only="))
  .map((a) => a.slice("--only=".length));

const ignoreDemand = process.argv.includes("--ignore-demand");
const result = await draftArticles({
  limit: Number.isFinite(limit) ? limit : only.length || undefined,
  ignoreDemand,
  only,
});

console.log(`[seo-articles] ${result.message}`);
for (const a of result.articles) {
  const state = a.errors > 0
    ? `(${a.errors} voice-gate errors, waiting for an edit)`
    : a.published
      ? `(published as ${a.commit})`
      : "(clean, but not sent)";
  console.log(`  ${a.locale}/${a.slug}: "${a.title}" ${state}`);
}

// Tell the founders what went out and what is waiting on them. Push is best
// effort: a failed notification must not fail the batch, because everything is
// already saved and visible on /seo either way.
if (result.drafted > 0) {
  try {
    const subs = listPushSubs();
    if (subs.length > 0) {
      const waiting = result.drafted - result.published;
      const { sendToAll } = await import("../lib/push.ts");
      const push = await sendToAll({
        title: waiting > 0
          ? `${result.published} published, ${waiting} need you`
          : `${result.published} SEO article${result.published === 1 ? "" : "s"} published`,
        body: result.articles.map((a) => a.title).join(" · ").slice(0, 160),
        url: "/seo",
      });
      console.log(`[seo-articles] notified ${push.sent} device${push.sent === 1 ? "" : "s"}`);
    }
  } catch (error) {
    console.log(`[seo-articles] push notification skipped: ${error instanceof Error ? error.message : error}`);
  }
}

// A day that published nothing is a failed run, not a quiet one. The exit code
// is what the supervisor reads, and it is the only thing that makes it come
// back and try again before the day is out — so the floor is enforced here, not
// merely reported.
process.exit(result.metFloor && !(result.drafted === 0 && result.failed > 0) ? 0 : 1);
