# Stride Console

The private marketing machine for Stride AI. Two founders log in, press a button, and get a finished LinkedIn post: sourced from the week's AI news, written in the Stride voice, gated by a deterministic anti-slop linter, rendered into on-brand visuals, and published through a copy-open flow. Nothing ever auto-posts.

This is Phases 0-4 of the marketing machine master plan — the console shell, the full content engine, the automation layer, the event engine, and the phone app — running with zero external accounts. No LinkedIn API, no database service. Everything lives in local JSON files under `data/`.

## The three buttons

| # | Recipe | What it does |
|---|--------|--------------|
| 01 | The Stride TLDR | Pulls the week's items from your source list, picks the top 7, writes a one-line-each newsletter post, renders the indexed TLDR image. |
| 02 | Breaking This Week | Ranks the week's stories, clusters the top one, writes the "what it means for operators" post, renders the midnight news image. |
| 03 | Myth vs Reality | Takes the oldest unused myth from the myth bank, writes the long-form post, renders a cover/myth/reality/closing carousel and assembles the PDF for LinkedIn document upload. |

Every recipe runs the same five stages: source → write → voice gate → design → publish.

## Setup (macOS)

```bash
git clone <this repo>
cd stride-console
npm install
npm run dev
```

Open http://localhost:3000, log in with the shared password (`stride` by default), pick which founder you are.

Optional `.env.local` (see `.env.example`):

- `STRIDE_PASSWORD` — change the shared password.

### Writing engine — your Claude subscription by default

If Claude Code is installed on this machine (`claude` on PATH) the console writes every draft through `claude -p`, which runs on your existing Claude subscription — no API key, no per-token billing. This is detected automatically; the settings page shows which engine is active. Related vars: `CLAUDE_BIN` (CLI path if not on PATH), `CLAUDE_CLI_MODEL` (e.g. `sonnet`), `STRIDE_WRITER` (force `subscription` | `api` | `template`).

- `ANTHROPIC_API_KEY` — optional alternative: bill the Anthropic API instead (`ANTHROPIC_MODEL` defaults to `claude-sonnet-4-5`).
- With neither, every draft is still usable: deterministic templates marked "needs polish", each carrying a copy-ready Claude prompt.

## How publishing works (copy-open flow)

LinkedIn's API needs an approved developer app, so Phase 1 publishes manually in three taps:

1. On a draft, pick the destination tab (Company page / Jort / Sarvesh) and press "Copy text."
2. Press "Open LinkedIn." — it opens the share composer at `linkedin.com/feed/?shareActive=true`. Paste.
3. Attach the downloaded image (or the PDF as a document for carousels), post, then press "Mark posted." so the log stays honest.

The voice gate blocks "Approve." while any variant has a blocking violation, so only clean drafts reach LinkedIn.

## The voice gate

`lib/pipeline/lint.ts` is a deterministic linter built from the Stride Voice Guide (`lib/voice/guide.ts`): negation pivots, a banned-word list, phantom sources, boosters without numbers, staccato triplets, em-dash/emoji/exclamation bans, hook-inside-140-chars, 1,200–2,000 character band, paragraph and hashtag rules, at-least-one-number. Errors block approval; in API mode a failed lint triggers exactly one rewrite with the violations listed.

## Scheduled pre-generation

`npm run pregen` writes the week's draft headlessly: Monday sources and writes the TLDR, Wednesday the news post. It is safe to run twice — one draft per recipe per ISO week. A launchd template plus setup steps live in `docs/AUTOMATION.md`; once loaded, drafts wait in the console by breakfast and the dashboard shows a ready-to-review banner (`data/inbox.json`, no external notification service).

## Feedback memory

Every posted draft carries a small form for the LinkedIn numbers: impressions, reactions, comments, saves. Manual entry, two founders, ten seconds. `lib/pipeline/memory.ts` turns the log into a few plain-language lessons ("hooks with a number averaged 2,000 impressions against 700 without one") that ride along in every writer prompt. A lesson only appears when both sides of a comparison have at least 2 posts and the gap is at least 25 percent. The current lessons show on the settings page.

## The event engine (1 Min AI Pitch)

The Events tab creates an event (date, venue, capacity) and generates the T-6-weeks checklist: venue, invites, speakers, investors, catering, photographer, each with a due date counted back from the night. The public signup page at `/pitch` needs no login: name, startup, one-line idea, into `data/signups.json`, rate-limited by IP. Four event recipes run through the same pipeline and voice gate as everything else: announcement, lineup, week-before reminder, day-after recap. Event posts are the promo slice, about 1 in 10 — the runner warns when an event post would be the third post of a week. Myths heard at the event go straight into the myth bank from the event page.

## LinkedIn API groundwork

`lib/publish/linkedin.ts` has the OAuth, image-upload and create-post flow typed out and documented, behind `STRIDE_LINKEDIN=on` plus credentials. It is inactive: nothing calls it, and every function throws until the flag and keys exist. Publishing stays copy-open until then, and approval stays with the founders either way.

## The phone app

The console installs as a PWA, so draft review works from a pocket.

**Founder setup (Jort, start here).** The full walkthrough lives in
[docs/PHONE-INSTALL.md](docs/PHONE-INSTALL.md). The short version:

1. Accept the Tailscale invite from Sarvesh, install the **Tailscale** app
   on your iPhone, sign in, flip it to **Connected** and accept the VPN
   prompt. The console is only reachable on our private network — no
   Tailscale, no console.
2. In Safari, open `https://mac-mini.tailc91701.ts.net` and log in
   (password: ask Sarvesh).
3. Share button → **Add to Home Screen** → open the Stride icon.
4. In the app: Settings → enable draft-ready notifications.

If it ever says the console is unreachable, the Tailscale switch is off
nine times out of ten. The troubleshooting list is in the guide.

**Add to Home Screen.** Open the console in the phone's browser (same network as the machine running it, e.g. `http://<your-mac>.local:3000`). On iPhone: Safari, the Share button, "Add to Home Screen." On Android: Chrome, the three-dot menu, "Add to Home screen" or the install prompt. The app opens full screen with the brand mark as its icon.

**Draft-ready pushes.** Settings has a "Draft-ready notifications" toggle per device. Turn it on and pregen sends "Your Monday Stride TLDR is ready to approve." with a tap-through to the draft. Self-hosted: VAPID keys generate themselves into `data/push-keys.json`, subscriptions live in `data/push-subs.json`, and delivery uses the browser's own push service and nothing else. The push carries a title, never draft content. On iPhone this needs iOS 16.4 or later and the app installed on the Home Screen first.

**One-handed review.** On phone widths the draft screen keeps Copy and Approve (or Mark posted) in a fixed bar at the bottom, inside thumb reach. An offline visit gets a branded shell instead of a browser error.

**Native iOS app (optional).** `ios/` holds an Xcode project: a native shell around the console with pull-to-refresh, external links routed to the LinkedIn app, and downloads handed to the share sheet. Open `ios/StrideConsole.xcodeproj`, set your team under Signing & Capabilities, plug in the phone, press Run. Regenerate the project after editing `ios/project.yml` with `xcodegen generate`. Two honest trade-offs against the PWA: a free Apple ID re-signs every 7 days, and draft-ready pushes only reach the installed PWA, not the native shell. The console URL lives in `ios/Sources/ContentView.swift`.

## Data

Everything is JSON under `data/` (gitignored, auto-created): `drafts.json`, `seen.json` (dedupe cache: URL match + >80% title similarity), `myths.json`, `sources.json` (seeded from `config/sources.default.json` on first run), `postlog.json` (now including manually entered stats), `inbox.json`, `events.json`, `signups.json`. Renders land in `data/renders/<draftId>/`.

## Tests and the no-network demo

```bash
npm test          # voice gate, dedupe, and render tests (node --test)
npm run demo      # fixtures -> template writer -> lint -> design
```

The demo writes `data/demo/{tldr.png,news.png,myth.pdf}` and prints all three draft texts, proving the whole machine works before any API key exists.

## Where Agent-Reach fits

When you run the console's sourcing from a machine with [Agent-Reach](https://github.com/Panniantong/Agent-Reach) installed (it ships as a Claude Code skill), it enriches Stage 1: Twitter/X and Reddit reading for catching stories where they break, LinkedIn competitive reading, and free Exa search. The built-in sourcing (RSS + Jina Reader) needs nothing installed at all. Agent-Reach is read-only by design — publishing stays with the copy-open flow.

## Roadmap

- **Phase 2 — Automation:** done. Scheduled pre-generation, ready-banner, stats + feedback memory, LinkedIn API stub.
- **Phase 3 — Event engine:** done. Events tab with checklist, public /pitch signup, four event recipes.
- **Phase 4 — Phone app:** done. Installable PWA, self-hosted draft-ready push, one-handed review.

The machine is feature-complete against the master plan. Next up when it hurts: LinkedIn API activation (the stub is ready), per-event signups, and moving off the file store.

See `stride-marketing-machine-architecture.md` in the project workspace for the full plan.
