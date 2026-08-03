# The SEO engine

The website works on itself. Every night an agent looks for what people search
for, checks how each page reads to a crawler, fixes what it can fix safely, and
commits the result so the site rebuilds. Every morning it writes up to three
articles for the biggest gaps and publishes the ones that come out clean.
Discovery covers the Netherlands, Belgium, Germany and France; the site itself
stays English and Dutch.

Nothing reaches the live site without passing a deterministic gate: length,
keyword placement and schema for metadata, and the voice gate for articles.
What the gate flags is what waits for a person on `/seo` — so a human reads
the machine's bad work, not its good work.

Everything it does arrives as a git commit authored by `seo-agent`, which
means one `git revert` undoes any of it.

---

## Starting it

```bash
cd ~/stride-console
npm run backend
```

That starts the console and the agents together. Starting the console alone
leaves a system that looks healthy and quietly stops improving, which is why
there is a single command.

To run a job by hand:

```bash
npm run seo:sweep                  # discovery, audit, metadata fixes
npm run seo:sweep -- --shallow     # skip the alphabet pass, much faster
npm run seo:sweep -- --dry-run     # propose changes, write nothing
npm run seo:articles               # draft this week's articles
npm run agents -- --now=sweep      # run one job through the supervisor and exit
```

## The schedule

| When | Job | What it does |
|---|---|---|
| 03:15 daily | sweep | Discovers keywords, pulls Search Console, audits every page, applies safe metadata fixes, queues article briefs |
| 07:40 daily | articles | Drafts up to three articles for the highest-opportunity gaps, then notifies your phone |

The supervisor holds its own clock rather than using launchd calendar events,
because the Mac sleeps and a calendar job that fires while asleep is simply
missed. This catches up on wake, inside a window that closes so a machine woken
at 23:00 does not start a sweep nobody will read.

## Running it under launchd

Optional. `npm run backend` is enough if the console is already started that
way. To run the agents as their own always-on job:

```bash
cp docs/com.stride.seo.plist ~/Library/LaunchAgents/
# edit it and replace REPLACE_WITH_REPO_PATH with /Users/<you>/stride-console
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stride.seo.plist
launchctl kickstart -k gui/$(id -u)/com.stride.seo
tail -f /tmp/stride-seo.log
```

---

## Connecting Google Search Console

Until this is done there are no click or ranking numbers. The dashboard says
"not measured" rather than showing zeroes, because a dashboard reading 0 clicks
is indistinguishable from one that was never connected and the two mean
opposite things.

It is also the single biggest upgrade to the engine's judgement. Without it,
keyword scoring works from intent and phrasing. With it, scoring is driven by
striking distance: a term sitting at position 5 to 20 with real impressions is
already close, and moving it up converts traffic Google is already showing you.
It also harvests the queries people actually used, which is better data than
any keyword tool.

### 1. Verify the property

Two routes. Pick by which access you have.

**By meta tag (no DNS access needed, recommended).** In
[Search Console](https://search.google.com/search-console) choose **URL prefix**
and enter `https://stride-ai.nl`. Pick the **HTML tag** method and copy the
`content="..."` value. Put it in the website repo at
`content/seo/pages.json` under `site.googleSiteVerification`, deploy, then press
Verify. The site's root layout renders the tag from that value, so verifying is
a data change rather than a code change.

Then set the property, because a URL-prefix property is not the default:

```bash
export GSC_SITE_URL="https://stride-ai.nl/"
```

Add it to the console's launchd plist so scheduled runs see it too.

**By DNS (Domain property).** Covers `stride-ai.nl`, `www`, and every path in
one go, which is tidier. It needs a TXT record, and the nameservers are
`kai.ns.cloudflare.com` / `walk.ns.cloudflare.com`, so the record goes in
**Cloudflare**, not at mijndomein. Mijndomein is only the registrar. If the
Cloudflare zone sits on Jort's account, you need him to invite you as a member
first; signing in as yourself will not show a zone you are not on.

With this route the default `sc-domain:stride-ai.nl` is already correct and
`GSC_SITE_URL` can stay unset.

### 2. Create a service account

In [Google Cloud Console](https://console.cloud.google.com):

1. Create a project (or reuse one).
2. Enable the **Google Search Console API**.
3. Go to **IAM and Admin → Service Accounts → Create service account**. Name it
   anything; it needs no project roles.
4. Open it, go to **Keys → Add key → Create new key → JSON**, and download it.

### 3. Give it read access to the property

Back in Search Console: **Settings → Users and permissions → Add user**. Paste
the service account's `client_email` (it looks like
`something@project.iam.gserviceaccount.com`) and give it **Full** or
**Restricted**. Restricted is enough; the engine only reads.

### 4. Drop the key in

```bash
mv ~/Downloads/<the-key>.json ~/stride-console/data/gsc-key.json
chmod 600 ~/stride-console/data/gsc-key.json
```

`data/` is gitignored, so the key never reaches a repository.

Override the location or property with `GSC_SERVICE_ACCOUNT_KEY` and
`GSC_SITE_URL` if you need to. The default property is `sc-domain:stride-ai.nl`,
which is the form a Domain property uses; a URL-prefix property would be
`https://stride-ai.nl/`.

### 5. Check it

```bash
npm run seo:sweep -- --shallow
```

The sweep reports `partial` with a Search Console reason while it is not
connected, and stops mentioning it once it is. Search Console data lags about
two days, and a brand-new property has no history, so expect an empty but
*available* result at first.

---

## What the agent may and may not change

**It may edit `content/seo/pages.json`** in the website repo. That file is the
single source of every page title, description and keyword target. Each
proposed value is checked before it is written: length bounds, that it targets
the keyword, that it starts with a capital, no em dashes, no emoji, and the
same voice gate every other piece of Stride writing passes. A proposal that
fails is dropped rather than applied with a warning, because unattended
"applied with a warning" means live and wrong until somebody reads a log.

**It may add markdown files under `content/blog/`**, once the article passes
the long-form voice gate with zero errors. A draft the gate flags is never
published by the machine — it stays on `/seo` and waits to be read, which is
also the only place a wrong-target article gets caught. The gate cannot know
that a well-written piece is about somebody else's product.

**It may not edit any `.tsx` file.** H1s, body copy and page structure live in
components, and a machine editing JSX is one bad regex from breaking the build.
So findings like "the primary keyword is absent from the H1" are reported for a
human and never auto-fixed. That is why the on-page score plateaus rather than
reaching 100 on its own: what is left is deliberately yours.

Every change is a git commit in the website repo, with the reason in the
message. A bad run is undone with `git revert`.

## Configuration

`data/seo-config.json`, created on first write. Defaults:

| Key | Default | Meaning |
|---|---|---|
| `siteRepo` | `~/ai-agency-website` | The website checkout to publish into. Override with `STRIDE_SITE_REPO`. |
| `baseUrl` | `https://stride-ai.nl` | What the auditor fetches. |
| `locales` | `["en","nl"]` | Languages tracked. |
| `articlesPerRun` | `3` | Drafts per run, and the run is daily. With Dutch twins on, three briefs can mean up to six writer runs. |
| `dutchTwins` | `true` | After an English article, write the Dutch counterpart under the same slug, using a Dutch keyword found in the store. No matching term, no twin. |
| `autoApplyMetadata` | `true` | Apply title and description fixes without asking. Reversible with one git revert; holding them for approval means the site only improves when somebody remembers to look. |
| `autoPublishOnApproval` | `true` | Push after publishing, so the site rebuilds. Set false to commit locally only. |
| `autoPublishArticles` | `true` | Publish an article as soon as the writer produces it, if the voice gate reports zero errors. Set false to make every article wait for the Publish button on `/seo`. |

Seed keywords live in the same file under `seeds`. They are the starting point
for discovery, not the whole set: each seed is expanded through Google's
autocomplete with intent modifiers and an alphabet pass.

## Where things are stored

Everything under `data/`, gitignored, atomic writes:

| File | Contents |
|---|---|
| `seo-keywords.json` | Every tracked keyword with intent, cluster, assigned page, opportunity score and Search Console numbers |
| `seo-clusters.json` | Hub-and-spoke groupings |
| `seo-briefs.json` | Queued article briefs for gaps nothing serves |
| `seo-articles.json` | Drafts, approved, published |
| `seo-audits.json` | Latest per-page audit |
| `seo-sweeps.json` | Last 90 sweeps, with every metadata change and its reason |
| `seo-agent-state.json` | When each scheduled job last ran |

## Known rough edges

Autocomplete surfaces terms that are on-topic but not ours: other companies'
product names (`ai agent pricing ghl`, `ai agent tools n8n`) and unrelated firms
that share a word (`ai bureau veritas`). `OFF_BRAND` in `expand.ts` now catches
the names that leaked — `bureau` is on-topic for the Dutch AI-bureau, which is
how the US Census Bureau got an article — but it catches names, not topics. A
keyword that is off-brief for a subtler reason still needs a person, and at one
article a day the queue on `/seo` is worth reading daily, not weekly.
Discarding a draft costs one click.

## Europe

Discovery is European; publishing is not, yet.

Every seed is asked with each European place appended — `ai automation agency
germany`, `ai agency berlin`, `ai consultant antwerpen` — because that is what
measurably surfaces demand outside the Netherlands. The obvious approach, a
market per country (`gl=de`, `gl=fr`, `gl=be`), was tried and measured first:
asked the same English seed, Germany and France returned **one** term between
them that the Dutch query had not. Four extra markets, one extra keyword. The
country code is not where the difference lives; the words are.

Two rules hold this in place:

- **Place-targeted articles never publish themselves.** `isGeoTargeted()` marks
  any brief whose keyword names a country or city, and those wait on `/seo`
  however clean they read. A page per city, each saying the same thing with the
  name swapped, is the doorway pattern Google penalises site-wide — and a
  site-wide action takes the six pages that convert down with the blog.
- **American geography stays filtered.** `OFF_MARKET` keeps New York, Boston and
  the rest out, because a Dutch consultancy cannot sell there. London left the
  list: Europe is reachable, the Atlantic is not.

German and French *content* would mean new locales in the website repo — routes,
hreflang, a `Locale` change in both codebases. That decision has not been taken.
