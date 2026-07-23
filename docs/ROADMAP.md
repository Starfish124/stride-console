# Roadmap

## Done
- Phase 0 — Foundation: repo, brand tokens, voice guide + linter, sources.json, auth.
- Phase 1 — Content engine: three recipes end-to-end, visual templates (TLDR paper /
  News midnight / Myth carousel PDF), copy-open publishing, demo works offline.
- Writer upgrade: subscription mode — writes via the local Claude Code CLI
  (`claude -p`) on the founders' Claude plan. Fallbacks: API key, then templates.
- Phase 2 — Automation: `npm run pregen` (Mon=TLDR, Wed=news, one draft per
  recipe per ISO week) + launchd template in docs/, inbox.json ready-banner,
  manual stats entry on posted drafts + feedback-memory lessons in the writer
  prompt, LinkedIn API stub (lib/publish/linkedin.ts, inert behind env flag).

- Phase 3 — Event engine: Events tab (date/venue/capacity + T-6-weeks checklist
  with due dates), public /pitch signup (no auth, in-memory IP rate limit,
  signups.json), four event recipes (eventAnnounce/eventLineup/eventReminder/
  eventRecap) through the shared runner with a promo-slice warning on the third
  post of a week, myth quick-add on the event page.

- Phase 4 — Phone app: installable PWA (manifest, brand-mark icons, offline
  shell service worker), self-hosted web push on pregen (VAPID keys + subs in
  data/), one-handed review bar on phone widths.

## Next
- The master plan is built. Future work when it earns its keep: activate the
  LinkedIn stub, per-event signups, stats charts over postlog.json.

## Decisions on record
- Publishing is copy-open until LinkedIn API credentials exist. Nothing auto-posts.
- Agent-Reach = sourcing only (read-only by design).
- Free and private beats featureful: no paid deps, file store until it hurts.
- Stats are manual entry: no LinkedIn API scraping, two founders, ten seconds a post.
- Feedback lessons are deterministic and honest: a lesson needs at least 2 posts
  on each side of a comparison and a gap of 25 percent or more. No lesson beats
  a made-up one.
- Pregen never notifies externally; the inbox banner in the console is the
  notification until Phase 4 adds web push.
- Signups are one flat list (signups.json), not per-event: the console runs one
  event cycle at a time, and the lineup recipe reads the whole list. Split it
  per event when two cycles ever overlap.
- The promo-slice rule warns, never blocks: founders can post a third time in a
  week, but the runner says so on the draft.
- web-push (MIT, free) is the one new dependency of Phase 4: hand-rolling VAPID
  plus aes128gcm payload encryption is error-prone, and the no-paid-deps rule
  holds.
- Pushes carry a title line only, never draft text: they transit the browser
  vendor's push relay, and drafts stay on the machine.
