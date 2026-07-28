import { listClients, overdueClients, pipelineValue } from "@/lib/store";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { ClientsBoard } from "@/components/ClientsBoard";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = listClients();
  const totals = pipelineValue(clients);
  const overdue = overdueClients(clients);
  // Money still in play: what has been won is revenue, not pipeline, and what
  // is past is neither.
  const open = totals.lead + totals.talking + totals.proposal;

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

        <ClientsBoard clients={clients} />
      </main>
    </div>
  );
}
