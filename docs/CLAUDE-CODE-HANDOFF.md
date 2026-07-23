# Claude Code handoff — building the remaining phases

Copy the prompt below into Claude Code, run from the `stride-console` repo root.
One phase per session works best. Phases 0 and 1 are DONE (this repo), plus the
subscription writer. Remaining: Phase 2, 3, 4.

---

## The prompt

You are building the Stride AI marketing machine. Read these before writing any code:

1. `README.md` and `docs/ROADMAP.md` in this repo — what exists and what's next.
2. `AGENTS.md` — this Next.js version has breaking changes; check `node_modules/next/dist/docs/` before using any Next API.
3. `lib/voice/guide.ts` — the Stride voice. Every piece of copy you write, including UI copy, follows it: no "it's not X, it's Y", no emoji, no exclamation marks, positive framing, short sentences, headlines end with a period.
4. The design tokens in `tailwind.config.ts` / `app/globals.css` — indigo #3D44D9 is the only accent, max one accent per composition, Archivo for text, IBM Plex Mono for labels only.

House rules:

- One pipeline, three recipes. Never fork the pipeline per content type; extend the shared runner in `lib/pipeline/run.ts`.
- The voice-gate linter (`lib/pipeline/lint.ts`) is law. New content paths must pass through it. Never weaken a rule to make a test pass.
- Zero new paid dependencies. File-based store stays until Phase 2 explicitly moves it.
- Nothing ever auto-posts. Every publish action requires a founder tapping Approve.
- After each phase: `npm test` green, `npm run build` green, `node scripts/demo.mjs` still works, then a git commit named after the phase.

### Phase 2 — Automation (build this next)

- **Scheduled pre-generation.** A `npm run pregen` script that runs the tldr recipe (Mondays) and news recipe (Wednesdays) headlessly and saves drafts, so drafts wait in the console by breakfast. Add a macOS `launchd` plist template in `docs/` plus setup instructions; the script must be safe to run twice (skip if a draft for that recipe already exists this ISO week).
- **Draft-ready notification.** After pregen, write a one-line summary into `data/inbox.json`; the dashboard shows a "ready to review" banner. No external notification service.
- **Stats + feedback memory.** A simple form on each posted draft to record impressions/reactions/comments/saves (manual entry — no LinkedIn API yet). Store in `postlog.json`. A `lib/pipeline/memory.ts` that turns the log into 3–5 plain-language lessons ("hooks with a number outperform") appended to the writer prompt. Show the lessons on the settings page.
- **LinkedIn API groundwork only:** a `lib/publish/linkedin.ts` stub with the OAuth + register-upload + create-post flow typed out and documented, behind an env flag, inactive until credentials exist.

### Phase 2.5 — Marketing dashboard (after Phase 2 — it reads Phase 2's data)

One page: `/dashboard`. It creates nothing and edits nothing; it is the read-only view over what the engine produced and how it performed. Simple and efficient beats featureful: one screen, no filters beyond a time-range toggle (8 weeks / 26 weeks), no chart library — hand-rolled inline SVG only, keeping the zero-dependency rule.

Sections, top to bottom, each with a mono eyebrow label:

1. **CADENCE — THE ONLY METRIC THAT KILLS US.** A stat tile row: posts this week vs target 2, current streak of on-target weeks, drafts waiting for review. Then a 12-week strip of small squares (one per scheduled slot): indigo filled = posted, indigo-tint = drafted not posted, line-gray = missed. This strip answers "is the machine actually running" in one glance.
2. **PERFORMANCE.** Once Phase 2 stats exist: per-post horizontal bars of impressions, with saves and comments as mono numbers beside each bar (saves matter most — weight them visually with an ink label, not a second color). Bars in indigo at 100% opacity for the top post, 40% for the rest — one accent per composition, so no multi-color series ever.
3. **WHAT'S WINNING.** The feedback-memory lessons from Phase 2, rendered as plain sentences with their supporting numbers ("Posts with a number in the hook: 2.1x impressions, 6 posts vs 4"). No chart — the lesson sentence is the visualization. Below it, a three-column recipe comparison (TLDR / News / Myth): median impressions, median saves, posts published, as mono numbers.
4. **SOURCES.** Per-source health dots from the last run reports: indigo = healthy, slate = skipped/stale, with the source name and last-seen date in small text. One line each.
5. **PIPELINE INPUTS.** Myth bank: unused myths count (link to dashboard quick-add). After Phase 3 ships: event signups count and days to the next 1 Min AI Pitch.

Design rules, non-negotiable: paper background, white cards with line borders, radius 12, 4px grid. Archivo for numbers and titles (numbers 700, big), IBM Plex Mono for eyebrows and small data labels only. Indigo is the single accent — a chart never uses a second hue; secondary series are slate or line-gray. No gradients, no shadows (border elevation only), no animation beyond hover states, no emoji, headlines end with a period. Axis lines and gridlines in `--line` #E3E4EC; never label what a mono number beside the mark can say instead. Empty states are written in the Stride voice and point to the action ("No stats yet. Mark a post as posted, then log its numbers there.").

Data: everything comes from the existing store (drafts.json, postlog.json, sources report, myths.json, later signups.json) — no new storage, no new deps. Add a small pure selector module `lib/dashboard/stats.ts` with unit tests (cadence strip derivation, median math, lesson thresholds honored: a comparison needs ≥2 posts per side and ≥25% gap).

Acceptance: page renders correctly with an empty store (fresh install), with drafts but no stats, and with a seeded fixture store (add `fixtures/postlog.json`); `npm test` covers the selectors; screenshot the three states and eyeball them against the design rules before committing. Note the phase in `docs/ROADMAP.md` when done.

### Phase 3 — Event engine (1 Min AI Pitch)

- Events tab: create an event (date, venue, capacity), T-6-weeks checklist auto-generated (venue, invites, speakers, investors, catering, photographer), check items off.
- Public signup page at `/pitch` (no auth): on-brand, name + startup + one-line idea, writes to `data/signups.json`, shows a confirmation in the Stride voice. Rate-limit by IP (simple in-memory).
- Four event content recipes through the existing pipeline: announcement, lineup, week-before reminder, day-after recap. Event posts are the 10% promo slice — the runner must warn if an event post would be the third post in a week.
- Every event feeds the machine: a "capture myth" quick-add on the event page (myths heard at the event go straight to the myth bank).

### Phase 4 — Phone app (last)

- Make the console an installable PWA: manifest, icons from the brand mark (upward triangle, indigo on light), service worker with offline shell, "Add to Home Screen" instructions in README.
- Web Push notification when pregen finishes ("Your Tuesday TLDR is ready to approve.") — self-hosted via the service worker, no external push service beyond the browser's own.
- Test on iOS Safari and Android Chrome viewport sizes; the draft review screen must work one-handed on a phone (approve/copy buttons in thumb reach).

Work phase by phase. Announce a short plan before each phase, then build, then run all checks, then commit. If a decision is genuinely ambiguous, choose the option that keeps the machine free, private, and founder-approved, and note the decision in `docs/ROADMAP.md`.
