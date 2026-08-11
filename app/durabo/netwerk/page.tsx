import Link from "next/link";
import { Header } from "@/components/ui";
import { buildNetwork } from "@/lib/durabo/network";

export const dynamic = "force-dynamic";

// Deliberately a static SVG from a server component: 21 people around a
// circle need no physics, no canvas and no client JS. Reload = rebuild.

const DEPT_TONE: Record<string, string> = {
  Leadership: "var(--color-violet)",
  "Buying & Product Development": "var(--color-indigo)",
  Design: "var(--color-signal)",
  "Sales & Customer Support": "var(--color-lime)",
  "Supply Chain & Logistics": "var(--color-amber)",
  "Quality & Compliance": "var(--color-mute)",
};

function dept(full: string): string {
  return full.replace(/\s*\(.*\)$/, "").trim();
}

export default async function DuraboNetwerkPage() {
  const net = buildNetwork();
  // Grouped by department so the sectors read as teams.
  const nodes = [...net.nodes].sort((a, b) => dept(a.department).localeCompare(dept(b.department)));
  const C = 350;
  const R = 250;
  const pos = new Map(
    nodes.map((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [n.slug, { x: C + R * Math.cos(angle), y: C + R * Math.sin(angle), angle }] as const;
    }),
  );
  const filled = net.nodes.filter((n) => n.filled).length;
  const externals = net.nodes.filter((n) => n.external);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-8">
          <Link href="/durabo" className="eyebrow text-slate">
            ← Durabo · rooster
          </Link>
          <h1 className="title-large mt-3 text-ink">Het netwerk</h1>
          <p className="mt-2 max-w-lg text-slate">
            Wie voedt wie, uit de dossiers ({net.links.length} verbindingen, {filled} van{" "}
            {net.nodes.length} dossiers gevuld). Een open ring is een dossier zonder data — een
            zichtbaar gat is data. Vult zich naarmate transcripten verwerkt worden.
          </p>
        </section>

        <svg viewBox="0 0 700 700" className="w-full" role="img" aria-label="Durabo netwerk">
          <defs>
            <marker id="pijl" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="var(--color-slate)" />
            </marker>
          </defs>
          {net.links.map((l) => {
            const a = pos.get(l.from);
            const b = pos.get(l.to);
            if (!a || !b) return null;
            return (
              <path
                key={`${l.from}-${l.to}`}
                d={`M ${a.x} ${a.y} Q ${C} ${C} ${b.x} ${b.y}`}
                fill="none"
                stroke="var(--color-slate)"
                strokeWidth="1.5"
                opacity="0.65"
                markerEnd="url(#pijl)"
              />
            );
          })}
          {nodes.map((n) => {
            const p = pos.get(n.slug)!;
            const tone = DEPT_TONE[dept(n.department)] ?? "var(--color-mute)";
            const right = Math.cos(p.angle) >= 0;
            return (
              <a key={n.slug} href={`/durabo/${n.slug}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="9"
                  fill={n.filled ? tone : "var(--color-paper)"}
                  stroke={tone}
                  strokeWidth="2.5"
                  strokeDasharray={n.filled ? undefined : "3 3"}
                />
                <text
                  x={p.x + (right ? 14 : -14)}
                  y={p.y + 4}
                  textAnchor={right ? "start" : "end"}
                  fill="var(--color-ink)"
                  fontSize="13"
                >
                  {n.name.split(" ")[0]}
                </text>
              </a>
            );
          })}
        </svg>

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(DEPT_TONE).map(([label, tone]) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-slate">
              <span className="inline-block size-2.5 rounded-full" style={{ background: tone }} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-slate">
            <span className="inline-block size-2.5 rounded-full border-2 border-dashed border-mute" />
            dossier nog leeg
          </span>
        </div>

        {externals.length > 0 && (
          <section className="mt-8">
            <h2 className="eyebrow mb-2 text-ink">Externe relaties (persoonsgebonden)</h2>
            <ul className="inset-group">
              {externals.map((n) => (
                <li key={n.slug} className="px-4 py-3 text-sm">
                  <span className="font-medium text-ink">{n.name}</span>
                  <span className="text-slate"> — {n.external}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
