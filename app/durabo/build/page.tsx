import Link from "next/link";
import { Header } from "@/components/ui";

// A frozen snapshot of the 2026-08-14 synthesis pass over the 12 completed
// interviews — not computed from the dossiers like /durabo/netwerk, because
// the content here is analysis (bucketing, corrections), not a fact the
// files already state. Re-write this page by hand after the next synthesis
// pass; it isn't meant to regenerate itself.

type Bucket = "Quick win" | "Win" | "Long-term investment";

const BUCKET_TONE: Record<Bucket, string> = {
  "Quick win": "bg-lime/15 text-lime",
  Win: "bg-indigo/15 text-indigo",
  "Long-term investment": "bg-violet/15 text-violet",
};

const OPPORTUNITIES: {
  bucket: Bucket;
  item: string;
  evidence: string;
  department: string;
}[] = [
  {
    bucket: "Quick win",
    item: "Shirley's 9-document Action compliance fill (~10 hrs/wk, fixed format, single owner, 100-order backlog)",
    evidence: "Shirley Gummels interview",
    department: "Quality & Compliance",
  },
  {
    bucket: "Quick win",
    item: "Sell-through / stock dashboard extension — data already sits in Power BI, needs longer history + per-item view",
    evidence: "Eric Markus interview",
    department: "Sales & Customer Support",
  },
  {
    bucket: "Quick win",
    item: "Productionize Abel's existing Claude prototype for the Friday/Monday supplier-update cycle",
    evidence: "Abel Kleefstra interview",
    department: "Supply Chain & Logistics",
  },
  {
    bucket: "Win",
    item: "Per-customer order-confirmation format translation (~50% of Destiny's time; Boolwoers, Kiek, Tedi, Petco, Rusta…)",
    evidence: "Destiny van der Greft + Eric Markus interviews",
    department: "Sales & Customer Support",
  },
  {
    bucket: "Win",
    item: "FOB / receipt / outbound shipping-document reformatting into Durabo's format",
    evidence: "Jesse Reitsma + Abel Kleefstra interviews",
    department: "Supply Chain & Logistics",
  },
  {
    bucket: "Win",
    item: "License-contract crosscheck across the licensor \"oerwoud\" — needs a contract database first",
    evidence: "Anouk de Rijk interview (filed under rita-el-khuri — see correction below)",
    department: "Buying & Product Development",
  },
  {
    bucket: "Long-term investment",
    item: "Finance / KPI dashboard layer — blocked on the Business Central migration (target 1 Sept data cleanup)",
    evidence: "Armando Bolhuis + Erik Smit interviews",
    department: "Other (Finance)",
  },
  {
    bucket: "Long-term investment",
    item: "Multi-portal licensor sync (Hello Kitty, Paw Patrol, SpongeBob, Harry Potter…) — no APIs, needs a browser-agent build",
    evidence: "Marrit van der Zee interview",
    department: "Other (Office) / Design",
  },
  {
    bucket: "Long-term investment",
    item: "Company-wide data centralization — the prerequisite Erik Smit named for everything else on this list",
    evidence: "Erik Smit interview",
    department: "Cross-department",
  },
];

const THEMES = [
  { label: "Excel as the de-facto system of record, pending Business Central", count: "~8 people, independently" },
  { label: "Per-customer / per-licensor format translation", count: "Destiny, Eric Markus, Shirley, Anouk" },
  { label: "Manual document-to-document retyping from PDF/email", count: "Armando, Jesse, Abel" },
  { label: "No unified visibility into \"what's where\" in supply chain", count: "Abel, Erik Smit, Eric Markus" },
  { label: "Key-person risk (one backup, or none)", count: "Shirley/Abel, Armando, Destiny" },
];

const NEXT_STEPS = [
  "Confirm with Erik Smit/Jort that the three-department read (Buying & Product Development, Supply Chain & Logistics, Sales & Customer Support) is right before it goes in any client-facing doc — it came from Erik Smit's interview, not Bianca's (she hasn't been interviewed yet).",
  "File a -corrections.md for the rita-el-khuri transcript: the recording under her name is actually Anouk de Rijk introducing herself. Rita's own attempt shows gestopt (stopped) and needs rebooking.",
  "Finish the remaining 8 interviews (Bianca, Aafke Hofman, Amanda Huurman not yet scheduled/done; Rita El Khuri and Paula Kok need a re-attempt; Ben Coes still needs a decision) before treating any ranking as final — the project's own rules hold the top-5 opportunity map until interview 20.",
  "Baseline-measure the top quick-win candidate (Shirley's compliance fill looks like the strongest single-owner, fixed-scope pilot) before building anything, per the engagement's Week-3 rule.",
];

export default function DuraboBuildPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-8">
          <Link href="/durabo" className="eyebrow text-slate">
            ← Durabo · rooster
          </Link>
          <h1 className="title-large mt-3 text-ink">
            Build, <span className="accent">insights</span> &amp; next steps
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Synthesis snapshot from 2026-08-14, across the 12 interviews completed so far. Provisional
            working material for Week 3 — not the final ranking.
          </p>
        </section>

        <section className="mb-10 rounded-lg border border-amber/30 bg-amber/10 p-4">
          <p className="eyebrow mb-2 text-amber">Corrections before this goes further</p>
          <ul className="space-y-2 text-sm text-ink">
            <li>
              The &ldquo;three priority departments&rdquo; came from <strong>Erik Smit</strong> (owner), not Bianca —
              she hasn&rsquo;t been interviewed yet. He named Buying &amp; Product Development and Supply Chain &amp;
              Logistics as overloaded, plus Sales &amp; Customer Support.
            </li>
            <li>
              The transcript filed as <strong>rita-el-khuri</strong> is actually <strong>Anouk de Rijk&rsquo;s</strong>{" "}
              interview. Rita&rsquo;s real attempt is marked gestopt in the live board and needs rebooking.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="eyebrow mb-3 text-ink">Cross-department themes</h2>
          <ul className="inset-group">
            {THEMES.map((t) => (
              <li key={t.label} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <span className="text-ink">{t.label}</span>
                <span className="shrink-0 text-slate">{t.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="eyebrow mb-3 text-ink">Opportunity draft</h2>
          <ul className="inset-group">
            {OPPORTUNITIES.map((o) => (
              <li key={o.item} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`eyebrow rounded-full px-2.5 py-0.5 ${BUCKET_TONE[o.bucket]}`}>
                    {o.bucket}
                  </span>
                  <span className="eyebrow text-slate">{o.department}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink">{o.item}</p>
                <p className="mt-1 text-xs text-slate">{o.evidence}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="eyebrow mb-3 text-ink">Next steps</h2>
          <ol className="inset-group">
            {NEXT_STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 px-4 py-3 text-sm text-ink">
                <span className="shrink-0 text-slate">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
