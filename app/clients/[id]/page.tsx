import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, listBlueprints, listInvoices } from "@/lib/store";
import { listProjects, listRuns } from "@/lib/workspace/store";
import { invoiceTotal, STAGE_LABELS } from "@/lib/types";
import { euro } from "@/lib/company";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { ClientDetail } from "@/components/ClientDetail";
import { AskStride } from "@/components/AskStride";

export const dynamic = "force-dynamic";

/**
 * The client hub: one page that holds the whole relationship.
 *
 * Built to be walked through — a founder shares this screen with the client
 * and scrolls: where we stand, what happened, what is being built, what was
 * billed, which blueprints they run on. At the foot sits a model scoped to
 * exactly this client's sheet, so "what did we do in July" gets answered in
 * the room instead of after the call.
 */
export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) notFound();
  const who = client.company || client.name;

  const projects = listProjects(client.id);
  const runs = projects
    .flatMap((p) => listRuns(p.id).map((r) => ({ project: p, run: r })))
    .sort((a, b) => (b.run.startedAt ?? "").localeCompare(a.run.startedAt ?? ""))
    .slice(0, 8);
  const invoices = listInvoices().filter((i) => i.clientId === client.id);
  const unpaid = invoices.filter((i) => i.status === "sent");
  const blueprints = listBlueprints().filter((b) =>
    b.uses.some((u) => u.client.toLowerCase() === who.toLowerCase()),
  );
  // Durabo's delivery has live pages of its own; the hub links rather than
  // duplicates. Matching on the name keeps this generic for the next client
  // whose engagement grows bespoke pages.
  const isDurabo = /durabo/i.test(who);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <Link href="/clients" className="eyebrow text-slate hover:text-indigo">
            ← The book
          </Link>
          <h1 className="title-large mt-3 text-ink">{who}</h1>
          <p className="mt-2 text-slate">
            {client.name}
            {client.role && ` · ${client.role}`} · {STAGE_LABELS[client.stage]}
          </p>

          {/* Everything of theirs, one tap each. */}
          <nav aria-label={`Everything for ${who}`} className="mt-4 flex flex-wrap gap-2">
            <Link href={`/clients/${client.id}/workspace`} className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo">
              Workspace
            </Link>
            <Link href={`/clients/${client.id}/one-pager`} className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo">
              One-pager
            </Link>
            <Link href="/invoices" className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo">
              Invoices{unpaid.length > 0 && ` · ${unpaid.length} unpaid`}
            </Link>
            <Link href="/blueprints" className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo">
              Blueprints
            </Link>
            {isDurabo && (
              <>
                <Link href="/durabo" className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo">
                  Interview days
                </Link>
                <Link href="/durabo/netwerk" className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo">
                  Netwerk
                </Link>
                <Link href="/durabo/build" className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo">
                  Build + insights
                </Link>
              </>
            )}
          </nav>
        </section>

        <ClientDetail client={client} deckUrl={process.env.STRIDE_DECK_URL} />

        {/* The engagement, in three columns a client can read upside down. */}
        <section className="mt-8 grid gap-x-8 gap-y-6 rounded-card border border-line bg-white p-5 sm:grid-cols-3">
          <div>
            <p className="eyebrow text-[10px] text-mute">Being built</p>
            {projects.length === 0 ? (
              <p className="mt-2 text-sm text-slate">No project on the machine yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {projects.map((p) => (
                  <li key={p.id} className="text-sm font-semibold text-ink">
                    {p.name}
                  </li>
                ))}
                {runs.slice(0, 5).map(({ project, run }) => (
                  <li key={run.id} className="text-[12px] leading-snug text-slate">
                    {(run.startedAt ?? "").slice(0, 10)} · {run.task.slice(0, 90)}
                    <span className="ml-1 eyebrow text-[9px] text-mute">{run.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="eyebrow text-[10px] text-mute">Billed</p>
            {invoices.length === 0 ? (
              <p className="mt-2 text-sm text-slate">Nothing invoiced yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {invoices.map((inv) => (
                  <li key={inv.id} className="text-sm text-ink">
                    <Link href={`/invoices/${inv.id}/print`} className="font-mono font-semibold text-indigo hover:underline">
                      {inv.number}
                    </Link>{" "}
                    · {euro(invoiceTotal(inv))}
                    <span className="ml-1.5 eyebrow text-[9px] text-mute">{inv.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="eyebrow text-[10px] text-mute">Runs on</p>
            {blueprints.length === 0 ? (
              <p className="mt-2 text-sm text-slate">No blueprints deployed yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {blueprints.map((b) => (
                  <li key={b.id} className="text-sm leading-snug">
                    <span className="font-semibold text-ink">{b.name}</span>
                    <span className="block text-[12px] text-slate">{b.oneLiner}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* The model that only knows this client. Walk-through mode: ask it
            the client's own questions, out loud, in the meeting. */}
        <p className="eyebrow mb-2 mt-10 text-slate">Ask about {who}</p>
        <AskStride clientId={client.id} clientName={who} />
      </main>
    </div>
  );
}
