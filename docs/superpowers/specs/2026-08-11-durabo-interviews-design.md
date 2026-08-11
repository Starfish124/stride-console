# Durabo interview days, live on the console — design

2026-08-11. Interviews run 12–13 Aug at Durabo (Joure); both founders interview
in person and need the process on their phones. Approved in session before
build.

## What this is

`/durabo` in the Delivery section: the discovery engagement's interview days,
live. Both phones (Sarvesh + Jort, Funnel URL, normal console login) see the
same state and can drive it.

## Source of truth: the discovery repo, not the console

`jorthubers/ai-discovery-durabo` is mirrored to the **private**
`Starfish124/ai-discovery-durabo` (a GitHub fork of a public repo cannot be
private, and the repo holds all 21 Durabo employees' names, emails and
profiles — hence mirror, not fork). Clone at `~/ai-discovery-durabo`, remotes
`origin` (ours) + `jort` (his), override with `DURABO_DIR`.

The console **reads the repo live** on every request — roster, field card,
prep briefs — so a `git pull` (e.g. Jort reschedules someone) shows up without
a deploy. The console **writes exactly one thing** into the repo: typed
interview notes, appended to
`employees/<slug>/interview-notes-<date>.md`, where the synthesis runbook
expects material. The roster markdown is never machine-edited; live statuses
live in `data/durabo-live.json` and syncing them back into `00-Roster.md` is a
manual follow-up after the interview days.

## Pieces

- `lib/durabo/parse.ts` — pure parsers: roster table → rows (slot, slug,
  status, interviewer annotation), `10-Field-Card-45min-NL.md` → 18 numbered
  steps with per-step minutes and a cumulative "klaar vóór min N" mark,
  employee doc → frontmatter meta + rendered body (MAP-DATA block stripped),
  plus a dependency-free markdown-to-HTML renderer (escapes input).
- `lib/durabo/io.ts` — repo reads, live-state JSON (console store pattern),
  note append. `requireSlug()` = the one traversal choke point: every path
  containing a slug validates it against the roster first.
- `app/api/durabo/route.ts` — GET state (both phones poll it at 5s), POST
  actions: start / finish / check / status / note. Founder attribution from
  the existing `stride_founder` cookie.
- `app/durabo` — day schedule grouped per day, live status chips, progress
  count. `app/durabo/[slug]` — sticky timer bar (amber past minute 33, "over
  tijd" past 40), the field card as tappable `<details>` checklist (first
  unchecked step open), prep brief tab, notes tab.

## Checks

`tests/durabo.test.mjs`: roster/field-card/employee-doc parsers on fixtures,
the real field card parses to exactly 18 steps, renderer escapes HTML.
Verified live: start → tick → note → file lands in the repo → phone-width
screenshots of all three screens.
