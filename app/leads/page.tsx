import Link from "next/link";
import { Header } from "@/components/ui";
import { LeadImport } from "@/components/LeadImport";
import { LeadPull } from "@/components/LeadPull";
import { LeadEnrol } from "@/components/LeadEnrol";
import { EngineLight } from "@/components/EngineLight";
import { listClients } from "@/lib/store";
import { listEnrolments } from "@/lib/salesnav/store";
import { listSequences } from "@/lib/outreach/sequence";
import { readIcp, apolloConfigured } from "@/lib/apollo";
import { readLeads, contactableCount, multiContactCompanies } from "@/lib/leads";

export const dynamic = "force-dynamic";

/**
 * The lead book, shaped like the tool it talks to.
 *
 * Apollo's own find-people screen is a filter rail on the left and results on
 * the right, and there is no reason to invent a different arrangement for the
 * same job. The rail is the search — chips, and a count that follows them,
 * because searching costs nothing. The right is who that search already found.
 *
 * Nothing on this page sends anything. It spends credits, which is why the
 * reveal asks twice and says the number both times.
 */
export default function LeadsPage() {
  const book = readLeads();
  const { leads } = book;
  const icp = readIcp();
  const clients = listClients();

  const inASequence = new Set(
    listEnrolments()
      .filter((e) => e.state !== "stopped")
      .map((e) => e.clientId),
  );
  const candidates = clients
    .filter((c) => c.linkedin?.trim() && !inASequence.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, company: c.company, role: c.role }));
  const linkedinSequences = listSequences()
    .filter((q) => !q.steps.some((step) => step.kind === "email"))
    .map((q) => ({ id: q.id, name: q.name, shape: q.steps.map((s) => s.kind).join(" → ") }));

  const shared = multiContactCompanies(leads);
  const companies = new Set(leads.map((l) => l.company).filter(Boolean)).size;

  const facts = [
    { label: "In the book", value: leads.length.toLocaleString("en-GB") },
    { label: "With an address", value: contactableCount(leads).toLocaleString("en-GB") },
    { label: "Companies", value: companies.toLocaleString("en-GB"), note: `${shared.length} with more than one` },
    { label: "Ready to enrol", value: candidates.length.toLocaleString("en-GB") },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {/* Title row, then a toolbar. The tool's shape, not a document's. */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 py-6">
          <div>
            <p className="eyebrow text-slate">Apollo outreach</p>
            <h1 className="display mt-1 text-[26px] text-ink">Lead book</h1>
          </div>
          <Link
            href="/outreach"
            className="pressable inline-flex min-h-[38px] items-center rounded-input border border-line bg-white px-4 text-[14px] text-ink"
          >
            The queue →
          </Link>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line py-3">
          <EngineLight />
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {facts.map((f) => (
              <div key={f.label} className="flex items-baseline gap-1.5">
                <span className="num text-[15px] text-ink">{f.value}</span>
                <span className="eyebrow text-slate">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* The search. */}
          <aside className="flex flex-col gap-4">
            <div className="rounded-card border border-line bg-paper p-4">
              <p className="eyebrow mb-3 text-slate">The search</p>
              <LeadPull icp={icp} configured={apolloConfigured()} />
            </div>
          </aside>

          <section className="flex min-w-0 flex-col gap-5">
            {/* The two things that move people forward, in the order they happen. */}
            <div className="rounded-card border border-line bg-white p-4">
              <p className="eyebrow text-slate">1 · Into the client book</p>
              <p className="mb-3 mt-1.5 text-[13px] leading-snug text-slate">
                A lead is a row Apollo found. A client is somebody the sequencer can enrol.
              </p>
              <LeadImport total={leads.length} />
            </div>

            <div className="rounded-card border border-line bg-white p-4">
              <p className="eyebrow text-slate">2 · Into a sequence</p>
              <p className="mb-3 mt-1.5 text-[13px] leading-snug text-slate">
                Everyone with a LinkedIn profile who is not already being written to.
              </p>
              <LeadEnrol
                candidates={candidates}
                sequences={linkedinSequences}
                imported={clients.length}
              />
            </div>

            {/* The results. Wide, so it scrolls inside itself rather than
                taking the page sideways on a phone. */}
            <div className="rounded-card border border-line bg-white">
              <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
                <p className="eyebrow text-slate">Who Apollo found</p>
                <p className="num text-[12px] text-slate">{leads.length}</p>
              </div>

              {leads.length === 0 ? (
                <p className="px-4 py-6 text-[14px] text-slate">
                  Nothing pulled yet. Set the search on the left and press what it would cost.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line">
                        {["Name", "Title", "Company", "Where", "Address", ""].map((h) => (
                          <th key={h} className="eyebrow px-4 py-2 font-medium text-slate">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => (
                        <tr key={lead.id} className="border-b border-line last:border-0 hover:bg-paper">
                          <td className="px-4 py-2.5 text-[13px] text-ink">{lead.name}</td>
                          <td className="px-4 py-2.5 text-[13px] text-slate">{lead.title}</td>
                          <td className="max-w-[220px] truncate px-4 py-2.5 text-[13px] text-ink">
                            {lead.company}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-slate">{lead.city || "—"}</td>
                          <td className="px-4 py-2.5 text-[13px]">
                            {lead.email ? (
                              <span className="text-lime-deep">verified</span>
                            ) : (
                              <span className="text-mute">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[13px]">
                            {lead.linkedin ? (
                              <a
                                href={lead.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo underline underline-offset-2"
                              >
                                profile
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
