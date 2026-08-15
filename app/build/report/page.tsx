import Link from "next/link";
import { Header } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { BUILD_REPOS } from "@/lib/build/repos";
import { listDeliverables } from "@/lib/build/deliverables";
import { listPrototypes } from "@/lib/build/prototypes";
import { readTrendStatus } from "@/lib/build/trend";
import { commitsSince, startOfLocalDay } from "@/lib/today";
import { listRuns } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

/**
 * The progress report is derived, never generated: counts and dates the disk
 * can prove, printable via the browser (the one-pager pattern). A number
 * nobody can trace to a file does not belong here.
 */
export default async function BuildReportPage() {
  const deliverables = listDeliverables();
  const prototypes = listPrototypes();
  const trend = readTrendStatus();
  const today = new Date().toISOString().slice(0, 10);
  const since = startOfLocalDay();
  const commits = BUILD_REPOS.flatMap((r) => commitsSince(r.dir, r.name, since));
  const runs = listRuns().slice(0, 5);

  const done = deliverables.filter((d) => d.status === "done").length;
  const ticks = deliverables.flatMap((d) => d.checklist);
  const ticksDone = ticks.filter((t) => t.done).length;
  const overdue = deliverables.filter((d) => d.due && d.due < today && d.status !== "done");

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="flex items-baseline justify-between py-8">
          <div>
            <Link href="/build" className="eyebrow text-slate no-print">
              ← Build
            </Link>
            <h1 className="title-large mt-2 text-ink">Progress report</h1>
            <p className="mt-1 text-sm text-slate">
              {new Date().toLocaleDateString("nl-NL", { dateStyle: "full" })} · derived from this
              machine, nothing invented
            </p>
          </div>
          <div className="no-print">
            <PrintButton />
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-card border border-line bg-white p-4 dark:bg-card">
            <p className="eyebrow text-slate">Deliverables</p>
            <p className="figure mt-1 text-2xl text-ink">
              {done}/{deliverables.length}
            </p>
            <p className="text-xs text-slate">done</p>
          </div>
          <div className="rounded-card border border-line bg-white p-4 dark:bg-card">
            <p className="eyebrow text-slate">Steps</p>
            <p className="figure mt-1 text-2xl text-ink">
              {ticksDone}/{ticks.length}
            </p>
            <p className="text-xs text-slate">ticked</p>
          </div>
          <div className="rounded-card border border-line bg-white p-4 dark:bg-card">
            <p className="eyebrow text-slate">Commits today</p>
            <p className="figure mt-1 text-2xl text-ink">{commits.length}</p>
            <p className="text-xs text-slate">across {BUILD_REPOS.length} repos</p>
          </div>
        </section>

        {overdue.length > 0 && (
          <section className="mt-6 rounded-card border border-amber/30 bg-amber/10 p-4">
            <p className="eyebrow text-ink">Overdue</p>
            <ul className="mt-2 flex flex-col gap-1">
              {overdue.map((d) => (
                <li key={d.id} className="text-sm text-ink">
                  {d.title} <span className="text-slate">— due {d.due}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="eyebrow text-slate">Deliverables</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {deliverables.map((d) => {
              const dTicks = d.checklist.filter((c) => c.done).length;
              return (
                <li
                  key={d.id}
                  className="flex items-baseline gap-3 rounded-card border border-line bg-white p-3 dark:bg-card"
                >
                  <span className="eyebrow w-16 shrink-0 text-slate">{d.status}</span>
                  <span className={`flex-1 text-sm ${d.status === "done" ? "text-slate line-through" : "text-ink"}`}>
                    {d.title}
                  </span>
                  <span className="text-xs text-slate">
                    {d.checklist.length > 0 ? `${dTicks}/${d.checklist.length}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="eyebrow text-slate">Prototypes</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {prototypes.map((p) => {
              const open = p.needs.filter((n) => !n.done);
              return (
                <li key={p.id} className="rounded-card border border-line bg-white p-3 dark:bg-card">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-ink">{p.name}</span>
                    <span className="text-xs text-slate">
                      {open.length} of {p.needs.length} needs open
                    </span>
                  </div>
                  {open.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {open.map((n) => (
                        <li key={n.id} className="text-xs text-slate">
                          · {n.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {prototypes.some((p) => p.dir?.endsWith("durabo-trend-engine")) && (
            <p className="mt-2 text-xs text-slate">
              Trend engine last ran:{" "}
              {trend.freshAt
                ? new Date(trend.freshAt).toLocaleString("nl-NL", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"}
            </p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="eyebrow text-slate">Commits today</h2>
          {commits.length === 0 ? (
            <p className="mt-2 text-sm text-slate">None yet today.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {commits.map((c) => (
                <li key={`${c.repo}-${c.sha}`} className="flex gap-2 text-sm">
                  <span className="eyebrow w-28 shrink-0 text-slate">{c.repo}</span>
                  <span className="text-ink">{c.subject}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="eyebrow text-slate">Recent workspace runs</h2>
          {runs.length === 0 ? (
            <p className="mt-2 text-sm text-slate">None recorded.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {runs.map((r) => (
                <li key={r.id} className="flex gap-2 text-sm">
                  <span className="eyebrow w-16 shrink-0 text-slate">{r.status}</span>
                  <span className="flex-1 truncate text-ink">{r.task}</span>
                  <span className="text-xs text-slate">{r.startedAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
