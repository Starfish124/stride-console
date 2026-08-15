import Link from "next/link";
import { Header } from "@/components/ui";
import { BUILD_REPOS, sessionNameFor } from "@/lib/build/repos";
import { buildSessions } from "@/lib/build/deck";
import { listDeliverables, layoutDag, type DeliverableStatus } from "@/lib/build/deliverables";
import { listPrototypes } from "@/lib/build/prototypes";
import { readTrendStatus } from "@/lib/build/trend";
import DeliverableBoard from "@/components/DeliverableBoard";
import PrototypeNeeds from "@/components/PrototypeNeeds";

export const dynamic = "force-dynamic";

const STATUS_FILL: Record<DeliverableStatus, string> = {
  todo: "var(--color-paper)",
  doing: "var(--color-indigo)",
  blocked: "var(--color-amber)",
  done: "var(--color-lime)",
};

function Dag() {
  const dag = layoutDag(listDeliverables());
  if (dag.nodes.length === 0) return null;
  const colW = 190;
  const rowH = 64;
  const nodeW = 160;
  const nodeH = 40;
  const rows = Math.max(...dag.nodes.map((n) => n.row)) + 1;
  const width = dag.cols * colW + 20;
  const height = rows * rowH + 20;
  const pos = new Map(
    dag.nodes.map((n) => [n.id, { x: 10 + n.depth * colW, y: 10 + n.row * rowH }] as const),
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width }}
        className="max-w-none"
        role="img"
        aria-label="Deliverable dependencies, left to right in build order"
      >
        <defs>
          <marker id="dag-pijl" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-slate)" />
          </marker>
        </defs>
        {dag.edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + nodeW;
          const y1 = a.y + nodeH / 2;
          const x2 = b.x;
          const y2 = b.y + nodeH / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={`${e.from}-${e.to}`}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--color-slate)"
              strokeWidth="1.2"
              opacity="0.6"
              markerEnd="url(#dag-pijl)"
            />
          );
        })}
        {dag.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const filled = n.status === "done" || n.status === "doing";
          return (
            <g key={n.id}>
              <rect
                x={p.x}
                y={p.y}
                width={nodeW}
                height={nodeH}
                rx="8"
                fill={STATUS_FILL[n.status]}
                fillOpacity={n.status === "todo" ? 1 : 0.15}
                stroke={n.status === "blocked" ? "var(--color-amber)" : "var(--color-line)"}
                strokeWidth={n.status === "blocked" ? 1.6 : 1}
              />
              <text
                x={p.x + 10}
                y={p.y + nodeH / 2 + 4}
                fontSize="11"
                fill={filled ? "var(--color-ink)" : "var(--color-slate)"}
              >
                {n.title.length > 26 ? `${n.title.slice(0, 25)}…` : n.title}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default async function BuildPage() {
  const sessions = await buildSessions();
  const bySession = new Map((sessions ?? []).map((s) => [s.name, s]));
  const deliverables = listDeliverables();
  const prototypes = listPrototypes();
  const trend = readTrendStatus();
  const trendProto = prototypes.find((p) => p.dir?.endsWith("durabo-trend-engine"));

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-8">
          <h1 className="title-large text-ink">Build</h1>
          <p className="mt-2 max-w-xl text-slate">
            The building area: live Claude sessions in the Stride repos, what has to ship, and
            every prototype&apos;s next step.{" "}
            <Link href="/build/report" className="text-indigo">
              Progress report →
            </Link>
          </p>
        </section>

        <div className="flex flex-col gap-10 xl:grid xl:grid-cols-[3fr_2fr] xl:items-start xl:gap-8">
          <div className="flex flex-col gap-10">
            <section>
              <h2 className="eyebrow text-slate">Sessions</h2>
              {sessions === null && (
                <p className="mt-3 rounded-card border border-amber/30 bg-amber/10 p-4 text-sm text-ink">
                  Daemon unreachable — the terminal needs daemondeckd on this Mac. Check{" "}
                  <code>launchctl list | grep deckremote</code>.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {BUILD_REPOS.map((repo) => {
                  const live = bySession.get(sessionNameFor(repo.dir));
                  return (
                    <div
                      key={repo.key}
                      className="rounded-card border border-line bg-white p-4 dark:bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`size-2 shrink-0 rounded-full ${
                            live ? (live.state === "working" ? "bg-amber" : "bg-lime") : "bg-mute/40"
                          }`}
                        />
                        <span className="flex-1 text-sm font-medium text-ink">{repo.name}</span>
                        <Link href={`/build/term?repo=${repo.key}`} className="text-sm text-indigo">
                          {live ? "Open" : "Claude"}
                        </Link>
                        <Link
                          href={`/build/term?repo=${repo.key}&mode=new`}
                          className="text-sm text-slate"
                        >
                          Fresh
                        </Link>
                        <Link
                          href={`/build/term?repo=${repo.key}&preset=shell`}
                          className="text-sm text-slate"
                        >
                          Shell
                        </Link>
                      </div>
                      <p className="mt-1 pl-5 text-xs text-slate">{repo.note}</p>
                      {live && live.tail.length > 0 && (
                        <pre className="mt-2 overflow-x-auto rounded-md bg-ink/5 p-2 text-[11px] leading-tight text-slate dark:bg-white/5">
                          {live.tail.join("\n")}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="eyebrow text-slate">Deliverables</h2>
              <div className="mt-3">
                <DeliverableBoard deliverables={deliverables} />
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-10">
            <section>
              <h2 className="eyebrow text-slate">The flow</h2>
              <div className="mt-3 rounded-card border border-line bg-white p-4 dark:bg-card">
                {deliverables.length > 0 ? (
                  <Dag />
                ) : (
                  <p className="text-sm text-slate">Nothing to deliver yet.</p>
                )}
                <p className="mt-2 text-xs text-slate">Left to right is build order.</p>
              </div>
            </section>

            <section>
              <h2 className="eyebrow text-slate">Prototypes</h2>
              <div className="mt-3 flex flex-col gap-3">
                {prototypes.map((p) => (
                  <div key={p.id} className="rounded-card border border-line bg-white p-4 dark:bg-card">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-ink">{p.name}</span>
                      {p.repo && (
                        <a
                          href={`https://github.com/${p.repo}`}
                          className="text-xs text-slate"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {p.repo}
                        </a>
                      )}
                    </div>
                    {p.note && <p className="mt-1 text-xs text-slate">{p.note}</p>}
                    {p === trendProto && (
                      <div className="mt-3 rounded-md bg-ink/5 p-3 text-sm dark:bg-white/5">
                        <p className="text-xs text-slate">
                          Last run:{" "}
                          {trend.freshAt
                            ? new Date(trend.freshAt).toLocaleString("nl-NL", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </p>
                        {trend.top.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1">
                            {trend.top.map((t) => (
                              <li key={t.title} className="flex justify-between text-xs">
                                <span className="text-ink">{t.title}</span>
                                <span className="font-mono text-slate">
                                  {t.growth !== null ? `${t.growth.toFixed(1)}×` : "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 flex gap-3 text-xs">
                          {trend.hasClusters && (
                            <a href="/api/build/clusters" className="text-indigo" target="_blank">
                              Visual clusters
                            </a>
                          )}
                          <Link href="/build/term?repo=durabo-trend-engine" className="text-indigo">
                            Claude here
                          </Link>
                        </p>
                      </div>
                    )}
                    <PrototypeNeeds id={p.id} needs={p.needs} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
