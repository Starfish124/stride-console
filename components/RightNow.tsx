import Link from "next/link";
import type { Client, Note } from "@/lib/types";
import { COMPANY, euro } from "@/lib/company";
import { invoiceTotal, type Invoice } from "@/lib/types";

/**
 * What the company is actually doing, on the front page.
 *
 * Three narrow columns, no cards-in-cards: the work in flight (the notes
 * board's "building" lane), the client front (everyone in play and the next
 * thing owed to them), and the company's own particulars — the block both
 * founders otherwise keep re-finding in old PDFs when a form asks for the
 * IBAN. Everything here is a link to the page where the real work happens.
 */
export function RightNow({
  doing,
  clients,
  invoices,
}: {
  doing: Note[];
  clients: Client[];
  invoices: Invoice[];
}) {
  const inPlay = clients
    .filter((c) => c.stage !== "past")
    .sort((a, b) => (a.nextStep ?? "9999").localeCompare(b.nextStep ?? "9999"))
    .slice(0, 4);
  const unpaid = invoices.filter((i) => i.status === "sent");
  const owedTotal = unpaid.reduce((s, i) => s + invoiceTotal(i), 0);

  return (
    <section className="mb-7">
      <p className="eyebrow mb-2 text-slate">Right now</p>
      <div className="grid gap-x-8 gap-y-6 rounded-card border border-line bg-white p-5 sm:grid-cols-3">
        <div>
          <p className="eyebrow text-[10px] text-mute">Being built</p>
          {doing.length === 0 ? (
            <p className="mt-2 text-sm text-slate">
              Nothing on the board.{" "}
              <Link href="/notes" className="text-indigo hover:underline">
                Put something on it.
              </Link>
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {doing.slice(0, 4).map((n) => (
                <li key={n.id} className="text-sm leading-snug text-ink">
                  <Link href="/notes" className="hover:text-indigo">
                    {n.text}
                  </Link>
                  {n.by && <span className="ml-1.5 text-[11px] text-mute">{n.by}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="eyebrow text-[10px] text-mute">Client front</p>
          {inPlay.length === 0 ? (
            <p className="mt-2 text-sm text-slate">Nobody in play.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {inPlay.map((c) => (
                <li key={c.id} className="text-sm leading-snug">
                  <Link href={`/clients/${c.id}`} className="font-semibold text-ink hover:text-indigo">
                    {c.company || c.name}
                  </Link>
                  <span className="ml-1.5 eyebrow text-[9px] text-mute">{c.stage}</span>
                  {(c.nextStepNote || c.nextStep) && (
                    <span className="block text-[12px] text-slate">
                      {c.nextStepNote ?? "Next step"}
                      {c.nextStep ? ` · ${c.nextStep}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {unpaid.length > 0 && (
            <p className="mt-3 text-[12px] text-slate">
              <Link href="/invoices" className="font-semibold text-ink hover:text-indigo">
                {unpaid.length} invoice{unpaid.length === 1 ? "" : "s"} unpaid
              </Link>{" "}
              · <span className="font-mono">{euro(owedTotal)}</span>
            </p>
          )}
        </div>

        <div>
          <p className="eyebrow text-[10px] text-mute">The particulars</p>
          <p className="mt-2 text-[12px] leading-relaxed text-slate">
            <span className="font-semibold text-ink">{COMPANY.name}</span> · {COMPANY.city}
            <br />
            {COMPANY.email} · {COMPANY.phone}
            <br />
            IBAN <span className="font-mono text-ink">{COMPANY.payment.iban}</span>
            <br />
            KvK <span className="font-mono text-ink">{COMPANY.registration.kvk}</span> · BTW{" "}
            <span className="font-mono text-ink">{COMPANY.registration.btw}</span>
            {COMPANY.registration.placeholder && (
              <span className="block text-[11px] text-mute">registration pending</span>
            )}
          </p>
          <p className="mt-2 text-[12px]">
            <Link href="/invoices" className="text-indigo hover:underline">
              Invoices
            </Link>
            {" · "}
            <Link href="/scout" className="text-indigo hover:underline">
              Event scout
            </Link>
            {" · "}
            <a href={`https://${COMPANY.site}`} className="text-indigo hover:underline">
              {COMPANY.site}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
