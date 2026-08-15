# Next level — the synthesis

Three research passes, 2026-08-15: what top AI agencies do differently (web), what GitHub
offers (licenses verified live), and what this console is missing (source-read). This file is
the merged conclusion and the order of battle. Sources in the pass reports; the durable claims
are repeated here with their strongest citation.

## The one-line strategy

**Sell what we already are: a local-first company brain, blueprint-powered, with proof.**
Nobody in the memory market sells SMEs a privacy-guaranteed institutional memory on their own
hardware; every vendor is cloud. Our console — file-based, local models, 0600 on everything
sensitive — *is* that product. The EU AI Act (enforcement Aug 2026) turns the architecture
into a trust wedge.

## The revenue ladder (from the market pass)

1. **Discovery Sprint, fixed price €2.5k–€7.5k** — the paid front door. Durabo was the
   prototype: interviews → baseline → rubric → top-5 → report. Blueprint it.
2. **Build Sprint, fixed per sprint** — working pilot demoed every Friday.
3. **Agent License, €300–€2k/mo per deployed agent** — drift monitoring, prompt versioning,
   RAG refresh. This is the MRR that separates agencies from project shops
   (pickaxe.co/post/ai-agent-pricing-models). Ten licenses ≈ a founder salary.
4. **Outcome pricing over hourly, everywhere.** 86% of consulting buyers prefer outcome-based
   engagements (premium.f1gmat.com); our delivery cost falls as the blueprint shelf grows —
   hourly billing would hand that margin to the client.

NL specifics: anchor against €95–€175/hr consultancy rates with fixed prices; lead with
digitalization subsidies (50–70% offset) to kill the budget objection (unify-ai.nl, openklauw.nl).

## Whitespace no competitor occupies (verified absent in 12 searches)

- **On-prem company brain as the deliverable.** Mem0/Zep/Letta all sell cloud. We sell the
  brain the client keeps.
- **Outcome-ROI client portal at SME prices.** Live view of what their agents did and saved.
  The console's own chassis, white-labeled. Retention machine.
- **Published benchmarks from real client data.** No NL/EU SME agency publishes agent
  performance numbers. First mover owns the proof narrative.

## The brain (built 2026-08-15, this repo)

The gap analysis found the console had five retrieval silos, two memory systems that had
never met, and zero semantic search — while the most valuable text in the company (interview
transcripts, replies, sends, touches, blueprints, invoices) sat in no index at all.

Shipped as Brain v1:

- `lib/brain/store.ts` — entity columns (client/project/blueprint/person), `occurred_at`,
  vectors table (Float32 BLOBs, brute-force cosine — thousands of rows, no ANN dependency),
  FTS duplicate fix, `remove()`, 0600.
- `lib/brain/embed.ts` — Ollama `/api/embed`, nomic-embed-text, never throws.
- `lib/brain/retrieve.ts` — **the one retrieval interface**: FTS5 + cosine, reciprocal-rank
  fusion, degrades to keyword-only when the embedder is cold.
- `lib/brain/ingest.ts` — the fan-in: touches, replies, outbound sends, account research,
  blueprints (+ reuse history), invoice lines, post-performance lessons, interview
  transcripts chunked at ~1,500 chars. Idempotent by source-ref hash.
- Wired: Ask Stride now recalls the past per question (`buildContext(question)`), delivery
  runs retrieve on project + task text, `/api/brain/search` is hybrid, the nightly distill
  ingests + backfills embeddings within a budget.

What v2 wants: meeting capture as a store (there is none — the calendar is synthetic),
diffX adapters for blueprints/invoices/scout in `lib/brain/diff.ts`, `scripts/brain-hook.py`
querying `retrieve` by cwd, and the client-facing cut of the brain (the whitespace product).

## UI stack to adopt (licenses verified via gh api)

All MIT/ISC, all small, ranked by value-for-effort: **motion** (motiondivision/motion — the
iOS spring feel), **sonner** (toasts with undo — pairs with the new failure states),
**cmdk** (dip/cmdk — palette substrate if the sheet ever outgrows its hand-rolled one),
**vaul** (bottom sheets for the PWA), **auto-animate** (list transitions in one hook),
**number-flow** (odometer KPIs), **base-ui** (headless a11y substrate), **observable plot**
(untemplated charts). Sleepers: **evilmartians/harmony** (APCA-tuned palette, near-zero-cost),
**openstatusHQ/data-table-filters** (ops-grade tables), **uwdata/mosaic** (client analytics
deliverables nobody has seen).

## License traps (do not adopt)

n8n (Sustainable Use — hosting for clients is exactly what it forbids), khoj + windmill
(AGPL), quivr (abandoned), invoiceninja (Elastic — no third-party hosting), marker (weights
capped at $5M revenue — fine today, flag in proposals), tremor/recharts (templated aesthetics,
the thing this console exists to not look like).

## Agency-superpower stack (all clean licenses)

docling (MIT, doc→data for every client RAG), mem0 (Apache-2.0, per-client memory upsell),
graphiti (Apache-2.0, temporal graphs when decision-history queries justify a graph DB),
llama.cpp + lancedb + sqlite-vec (the fully-local inference/vector kit), trigger.dev
(Apache-2.0 — the license-safe n8n substitute), cal.diy (MIT, portal scheduling),
chatwoot (MIT core, client support desk).

## Order of battle

1. ~~Brain v1~~ — shipped. Let the nightly runs build the corpus on the mac-mini.
2. **Blueprint the Durabo discovery sprint** as the productized front door (the report
   pipeline exists; write the blueprint payload, price it, put it on stride-ai.nl).
3. **Client portal cut** of the console: one client, read-only, their agents + ROI numbers.
   White-label the chassis. This is whitespace #2 and the retention machine.
4. **UI polish sprint** with the adopted stack: sonner for the new failure states, motion on
   the sheet and deck, number-flow on the stat band, harmony palette swap.
5. **Publish one benchmark** from Durabo delivery (with consent): the proof asset nobody
   else has.
