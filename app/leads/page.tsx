import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { LeadImport } from "@/components/LeadImport";
import {
  readLeads,
  personaOf,
  personaCounts,
  multiContactCompanies,
  contactableCount,
  PERSONA_LABEL,
} from "@/lib/leads";

export const dynamic = "force-dynamic";

/**
 * The lead book: who Apollo found, and the LinkedIn profile for each one.
 *
 * This is a reading room, not a control room. Nothing on this page sends,
 * connects or spends a credit — Apollo holds the search and the credits, a
 * founder opens the profile and writes the note. That division is the whole
 * point: the account that gets restricted for automating LinkedIn is Jort's
 * own, and no console feature is worth that.
 */
export default function LeadsPage() {
  const book = readLeads();
  const { leads, filters } = book;

  const personas = personaCounts(leads).filter((p) => p.count > 0);
  const shared = multiContactCompanies(leads);
  const companies = new Set(leads.map((l) => l.company).filter(Boolean)).size;

  const facts: { label: string; value: string; note?: string }[] = [
    {
      label: "Leads held",
      value: String(leads.length),
      note: book.poolSize ? `of ${book.poolSize.toLocaleString("en-GB")} matching` : undefined,
    },
    { label: "Companies", value: String(companies), note: `${shared.length} with more than one` },
    {
      label: "With an email",
      value: String(contactableCount(leads)),
      note: "the sequencer can act on these",
    },
    {
      label: "Pulled",
      value: book.exportedAt
        ? new Date(book.exportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "—",
      note: book.exportedAt ? "from Apollo" : "nothing pulled yet",
    },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-12">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Lead generation</p>
          <h1 className="display mt-3 text-3xl text-ink">
            {leads.length === 0
              ? "Nothing pulled yet."
              : `${leads.length} people worth a message.`}
          </h1>
          <p className="mt-3 text-[15px] text-slate">
            {leads.length === 0
              ? "Apollo holds the search. Once a list is exported it lands here, with a LinkedIn profile on every row."
              : "Found in Apollo against the Stride ICP, and held here so a founder can open each profile and write the note themselves. Nothing on this page sends anything."}
          </p>
        </section>

        {leads.length === 0 ? (
          <section className="card-glass rounded-card border border-line bg-white p-6">
            <p className="text-sm text-ink">
              No export in <span className="font-mono">data/apollo-leads.json</span> yet. Build a
              list in Apollo, then export it here.
            </p>
            <a
              className="mt-3 inline-block text-[13px] text-indigo underline underline-offset-2"
              href={book.list.url}
              target="_blank"
              rel="noreferrer"
            >
              Open Apollo
            </a>
          </section>
        ) : (
          <>
            <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {facts.map((f) => (
                <div
                  key={f.label}
                  className="card-raised rounded-card border border-line bg-white px-4 py-3.5"
                >
                  <dt className="eyebrow text-slate">{f.label}</dt>
                  <dd className="figure mt-1.5 text-[22px] text-ink">{f.value}</dd>
                  {f.note ? (
                    <p className="mt-1 text-[12px] leading-snug text-slate">{f.note}</p>
                  ) : null}
                </div>
              ))}
            </dl>

            {/* The one thing on this page that writes anything. Reading the
                book is free; copying it into the client book is the step that
                makes these people reachable by the sequencer, so it asks
                first. */}
            <section className="card-glass mb-8 rounded-card border border-line bg-white p-5">
              <p className="eyebrow text-slate">Into the client book</p>
              <p className="mb-4 mt-2 text-[15px] text-slate">
                A lead here is a row Apollo found. A client is somebody the sequencer can enrol.
                This copies the first into the second, skipping anyone already in the book.
              </p>
              <LeadImport total={leads.length} />
            </section>

            {/* The search itself, written out. A list nobody can see the
                criteria for is a list nobody trusts six weeks later. */}
            <section className="card-glass mb-8 rounded-card border border-line bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="eyebrow text-slate">The search</p>
                <a
                  className="text-[13px] text-indigo underline underline-offset-2"
                  href={book.list.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {book.list.name} in Apollo
                </a>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <div className="flex gap-2 text-[13px]">
                  <dt className="shrink-0 text-slate">Where</dt>
                  <dd className="text-ink">{filters.location}</dd>
                </div>
                <div className="flex gap-2 text-[13px]">
                  <dt className="shrink-0 text-slate">Size</dt>
                  <dd className="text-ink">{filters.employees} people</dd>
                </div>
                <div className="flex gap-2 text-[13px]">
                  <dt className="shrink-0 text-slate">Trade</dt>
                  <dd className="text-ink">{filters.industries.join(" · ")}</dd>
                </div>
                <div className="flex gap-2 text-[13px]">
                  <dt className="shrink-0 text-slate">Roles</dt>
                  <dd className="text-ink">{filters.titles.join(" · ")}</dd>
                </div>
              </dl>
              {personas.length > 0 ? (
                <p className="mt-3 border-t border-line pt-3 text-[13px] text-slate">
                  {personas
                    .map((p) => `${p.count} ${PERSONA_LABEL[p.persona].toLowerCase()}`)
                    .join(" · ")}
                </p>
              ) : null}
            </section>

            {shared.length > 0 && (
              <section className="mb-8 rounded-card border border-line bg-white p-5">
                <p className="eyebrow text-slate">More than one way in</p>
                <p className="mt-2 text-[13px] text-slate">
                  Two people at the same firm is a warm second approach, not a second cold one.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {shared.map((c) => (
                    <li
                      key={c.company}
                      className="rounded-card border border-line px-2.5 py-1 text-[13px] text-ink"
                    >
                      {c.company} <span className="text-slate">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="display mb-3 text-[22px] text-ink">The book.</h2>
              <ul className="flex flex-col gap-2">
                {leads.map((lead) => (
                  <li
                    key={lead.id}
                    className="card-raised rounded-card border border-line bg-white px-4 py-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-[15px] text-ink">{lead.name}</p>
                      <p className="eyebrow text-slate">{PERSONA_LABEL[personaOf(lead)]}</p>
                    </div>
                    <p className="mt-0.5 text-[13px] text-slate">
                      {lead.title}
                      {lead.company ? ` · ${lead.company}` : ""}
                      {lead.employees ? ` · ${lead.employees} people` : ""}
                      {lead.city ? ` · ${lead.city}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                      {lead.linkedin ? (
                        <a
                          className="text-indigo underline underline-offset-2"
                          href={lead.linkedin}
                          target="_blank"
                          rel="noreferrer"
                        >
                          LinkedIn
                        </a>
                      ) : null}
                      <a
                        className="text-slate underline underline-offset-2"
                        href={lead.apolloUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Apollo
                      </a>
                      {lead.email ? (
                        <span className="font-mono text-[12px] text-slate">{lead.email}</span>
                      ) : (
                        <span className="text-[12px] text-slate">no email</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
