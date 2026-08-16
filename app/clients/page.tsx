import { listClients, overdueClients, pipelineValue } from "@/lib/store";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { ClientsBoard } from "@/components/ClientsBoard";
import { FunnelDiagram } from "@/components/diagrams";
import { STAGE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = listClients();
  const totals = pipelineValue(clients);
  const overdue = overdueClients(clients);
  // Money still in play: what has been won is revenue, not pipeline, and what
  // is past is neither.
  const open = totals.lead + totals.talking + totals.proposal;

  // The funnel is the same book, drawn once as a shape instead of five
  // times as a number — "past" sits out since it never counted as pipeline
  // to begin with. Widths are real counts, not evenly spaced for looks.
  const funnel = (["lead", "talking", "proposal", "client"] as const).map((stage) => ({
    label: STAGE_LABELS[stage],
    count: clients.filter((c) => c.stage === stage).length,
  }));

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Sales · the book</p>
          <h1 className="title-large mt-3 text-ink">
            Who we are <span className="accent">talking to</span>.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Every lead and client in one place, with the next thing we owe each
            of them. Open somebody to get their one-pager.
          </p>

          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            <span>
              <span className="figure block text-[28px] text-ink">
                €{open.toLocaleString("en-GB")}
              </span>
              <span className="eyebrow text-slate">In play</span>
            </span>
            <span>
              <span className="figure block text-[28px] text-ink">
                €{totals.client.toLocaleString("en-GB")}
              </span>
              <span className="eyebrow text-slate">Won</span>
            </span>
            <span>
              <span
                className={`figure block text-[28px] ${
                  overdue.length > 0 ? "text-amber" : "text-ink"
                }`}
              >
                {overdue.length}
              </span>
              <span className="eyebrow text-slate">Owe a reply</span>
            </span>
          </div>
        </section>

        {clients.length > 0 && (
          <section className="mb-10 rounded-card border border-line bg-white p-6">
            <p className="eyebrow mb-1 text-slate">The funnel</p>
            <p className="mb-4 text-[13px] text-slate">
              Everyone in the book, by stage. Width is the real count — nobody rounds up here.
            </p>
            <FunnelDiagram
              layers={funnel}
              className="mx-auto block h-auto w-full max-w-xl"
            />
          </section>
        )}

        <ClientsBoard clients={clients} />
      </main>
    </div>
  );
}
