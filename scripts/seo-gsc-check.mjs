// Verify the Search Console connection, one failing step at a time.
//
// Run: npm run seo:gsc
//
// Each stage reports what it proved and, when it fails, the single next action.
// The stages are separate because the failures are completely different
// problems: a key that will not parse is a download issue, a token that will
// not mint is a disabled API, and a query that 403s is a missing permission in
// Search Console itself. Collapsing them into "it did not work" would send you
// looking in the wrong console.

import fs from "node:fs";
import {
  accessToken,
  fetchStats,
  keyPath,
  loadServiceAccount,
  siteUrl,
  status,
} from "../lib/seo/searchConsole.ts";

function ok(msg) {
  console.log(`  ok    ${msg}`);
}
function fail(msg, fix) {
  console.log(`  FAIL  ${msg}`);
  if (fix) console.log(`\n  Next: ${fix}\n`);
}

console.log(`\nSearch Console check\n  property: ${siteUrl()}\n  key path: ${keyPath()}\n`);

// ---- 1. the key file ----

if (!fs.existsSync(keyPath())) {
  fail("no key file at that path", `Create a service account, download its JSON key, then:
    mv ~/Downloads/<the-key>.json ${keyPath()}
    chmod 600 ${keyPath()}
  Full walkthrough: docs/SEO.md`);
  process.exit(1);
}

const account = loadServiceAccount();
if (!account) {
  fail(
    "the key file exists but has no client_email and private_key",
    "That is usually an OAuth client secret rather than a service account key. In Google Cloud go to IAM and Admin, Service Accounts, pick the account, Keys, Add key, Create new key, JSON.",
  );
  process.exit(1);
}
ok(`key parses, service account is ${account.client_email}`);

// ---- 2. can it mint a token ----

let token;
try {
  token = await accessToken();
  ok("Google issued an access token, so the key and the clock are both good");
} catch (error) {
  fail(`could not get a token: ${error.message}`, `Two usual causes. The Search Console API is not
  enabled on that project: enable it at
  https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
  Or the key was revoked, in which case create a new one.`);
  process.exit(1);
}
void token;

// ---- 3. can it read the property ----

const stats = await fetchStats(28);

if (!stats.available) {
  fail(`the API refused the query: ${stats.reason}`, `If that mentions permission, the service
  account is not a user on the property yet. In Search Console open Settings, Users and
  permissions, Add user, and paste:
    ${account.client_email}
  Restricted access is enough. If it mentions the site not existing, the property in
  GSC_SITE_URL does not match how it is registered: a Domain property is
  "sc-domain:stride-ai.nl", a URL-prefix property is "https://stride-ai.nl/".`);
  process.exit(1);
}

ok(`read the property for ${stats.from} to ${stats.to}`);

console.log(`
  clicks       ${stats.totals.clicks}
  impressions  ${stats.totals.impressions}
  CTR          ${(stats.totals.ctr * 100).toFixed(2)}%
  position     ${stats.totals.position.toFixed(1)}
  queries      ${stats.queries.length}
  pages        ${stats.pages.length}
`);

if (stats.queries.length === 0) {
  console.log(`  Connected, with no data yet. That is expected on a new property: Search Console
  lags about two days and only reports once the site has been crawled and shown.
  The next sweep will pick numbers up on its own.\n`);
} else {
  console.log("  Top queries:");
  for (const q of stats.queries.slice(0, 10)) {
    console.log(
      `    ${String(q.clicks).padStart(4)} clicks  ${String(q.impressions).padStart(6)} shown  pos ${q.position.toFixed(1).padStart(5)}  ${q.query}`,
    );
  }
  console.log("");
}

console.log("  Connected. Run npm run seo:sweep and scoring switches to striking distance.\n");
process.exit(0);
