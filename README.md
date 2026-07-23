# Stride Console

The private marketing machine for Stride AI. Two founders log in, press a button, and get a finished LinkedIn post: sourced from the week's AI news, written in the Stride voice, gated by a deterministic anti-slop linter, rendered into on-brand visuals, and published through a copy-open flow. Nothing ever auto-posts.

This is Phase 0+1 of the marketing machine master plan — the console shell plus the full content engine, running with zero external accounts. No LinkedIn API, no database service. Everything lives in local JSON files under `data/`.

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

1. On a draft, pick the destination tab (Company page / Founder A / Founder B) and press "Copy text."
2. Press "Open LinkedIn." — it opens the share composer at `linkedin.com/feed/?shareActive=true`. Paste.
3. Attach the downloaded image (or the PDF as a document for carousels), post, then press "Mark posted." so the log stays honest.

The voice gate blocks "Approve." while any variant has a blocking violation, so only clean drafts reach LinkedIn.

## The voice gate

`lib/pipeline/lint.ts` is a deterministic linter built from the Stride Voice Guide (`lib/voice/guide.ts`): negation pivots, a banned-word list, phantom sources, boosters without numbers, staccato triplets, em-dash/emoji/exclamation bans, hook-inside-140-chars, 1,200–2,000 character band, paragraph and hashtag rules, at-least-one-number. Errors block approval; in API mode a failed lint triggers exactly one rewrite with the violations listed.

## Data

Everything is JSON under `data/` (gitignored, auto-created): `drafts.json`, `seen.json` (dedupe cache: URL match + >80% title similarity), `myths.json`, `sources.json` (seeded from `config/sources.default.json` on first run), `postlog.json`. Renders land in `data/renders/<draftId>/`.

## Tests and the no-network demo

```bash
npm test          # voice gate, dedupe, and render tests (node --test)
npm run demo      # fixtures -> template writer -> lint -> design
```

The demo writes `data/demo/{tldr.png,news.png,myth.pdf}` and prints all three draft texts, proving the whole machine works before any API key exists.

## Where Agent-Reach fits

When you run the console's sourcing from a machine with [Agent-Reach](https://github.com/Panniantong/Agent-Reach) installed (it ships as a Claude Code skill), it enriches Stage 1: Twitter/X and Reddit reading for catching stories where they break, LinkedIn competitive reading, and free Exa search. The built-in sourcing (RSS + Jina Reader) needs nothing installed at all. Agent-Reach is read-only by design — publishing stays with the copy-open flow.

## Roadmap

- **Phase 2 — Full automation:** LinkedIn developer app + OAuth, scheduled pre-generation (drafts ready Tuesday/Thursday morning), stats pull + feedback memory.
- **Phase 3 — Event engine:** the 1 Min AI Pitch tab, signup page, event content recipes.
- **Phase 4 — Phone app:** installable PWA with a push when a draft is ready.

See `stride-marketing-machine-architecture.md` in the project workspace for the full plan.
