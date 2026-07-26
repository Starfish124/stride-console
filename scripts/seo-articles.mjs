// The weekly article batch. Drafts articles for the highest-opportunity gaps
// the sweep queued, and stops there.
//
// Nothing is published. Drafts wait on /seo for a human to read and press
// publish, which is the one part of this system that stays manual on purpose.
//
// Run: npm run seo:articles
//      npm run seo:articles -- --limit=1

import { weeklyArticles } from "../lib/seo/agent.ts";
import { listPushSubs } from "../lib/store.ts";

const limitArg = process.argv.slice(2).find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

const result = await weeklyArticles({ limit: Number.isFinite(limit) ? limit : undefined });

console.log(`[seo-articles] ${result.message}`);
for (const a of result.articles) {
  console.log(`  ${a.locale}/${a.slug}: "${a.title}"${a.errors > 0 ? ` (${a.errors} voice-gate errors, needs an edit)` : ""}`);
}

// Tell the founders there is something to approve. Push is best effort: a
// failed notification must not fail the batch, because the drafts are already
// saved and visible on /seo either way.
if (result.drafted > 0) {
  try {
    const subs = listPushSubs();
    if (subs.length > 0) {
      const { sendToAll } = await import("../lib/push.ts");
      const push = await sendToAll({
        title: `${result.drafted} SEO draft${result.drafted === 1 ? "" : "s"} ready`,
        body: result.articles.map((a) => a.title).join(" · ").slice(0, 160),
        url: "/seo",
      });
      console.log(`[seo-articles] notified ${push.sent} device${push.sent === 1 ? "" : "s"}`);
    }
  } catch (error) {
    console.log(`[seo-articles] push notification skipped: ${error instanceof Error ? error.message : error}`);
  }
}

process.exit(result.drafted === 0 && result.failed > 0 ? 1 : 0);
