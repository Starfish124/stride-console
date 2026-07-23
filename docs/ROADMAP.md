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

## Next
- Phase 3 — Event engine: 1 Min AI Pitch tab, public /pitch signup, event recipes.
- Phase 4 — Phone app: PWA install, push on draft-ready, one-handed review.

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
