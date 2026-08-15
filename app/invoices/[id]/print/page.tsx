import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoice } from "@/lib/store";
import { COMPANY, euro } from "@/lib/company";
import { invoiceDueDate, invoiceSubtotal, invoiceTotal, invoiceVat } from "@/lib/types";
import { Mark } from "@/components/Ramp";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** 26-07-2026 — the template's date shape, day first, dashes. */
function dmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * The invoice, exactly as the approved template draws it (pdf demo, 2026-07).
 * One A4 sheet; the browser's print dialog is the PDF writer, so what is on
 * screen is byte-for-byte what the client receives. Everything company-side
 * comes from lib/company.ts at render time — reprints pick up corrections.
 */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = getInvoice(id);
  if (!invoice) notFound();

  const subtotal = invoiceSubtotal(invoice);
  const vat = invoiceVat(invoice);
  const total = invoiceTotal(invoice);

  return (
    <div className="min-h-screen bg-paper pb-16">
      {/* Print isolation: on paper, the sheet is the page and nothing else
          exists — no tab bar, no header, no buttons. */}
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          body * { visibility: hidden; }
          #invoice-sheet, #invoice-sheet * { visibility: visible; }
          #invoice-sheet {
            position: absolute; left: 0; top: 0; width: 210mm; min-height: 297mm;
            margin: 0; box-shadow: none; border-radius: 0;
          }
        }
      `}</style>

      <div className="mx-auto flex max-w-[210mm] items-center justify-between px-4 py-4 print:hidden">
        <Link href="/invoices" className="eyebrow text-slate hover:text-indigo">
          ← All invoices
        </Link>
        <PrintButton />
      </div>

      <div
        id="invoice-sheet"
        className="mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col bg-white shadow-[0_10px_40px_-18px_rgba(10,12,20,0.35)]"
      >
        {/* The sheared strip: the mark's own angle, run across the top. */}
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            className="h-[7px] flex-1"
            style={{
              background: "linear-gradient(90deg, #2e30f8 0%, #6d6ffa 70%, #ececfe 100%)",
              clipPath: "polygon(0 0, 100% 0, calc(100% - 4px) 100%, 0 100%)",
            }}
          />
          <div className="h-[7px] w-10 -skew-x-[30deg] bg-violet" />
          <div className="h-[7px] w-4 -skew-x-[30deg] bg-indigo-tint" />
        </div>

        <div className="flex flex-1 flex-col px-14 pb-10 pt-10">
          {/* Lockup left, document name right. */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <Mark size={34} className="text-indigo" />
              <span className="text-[26px] font-bold tracking-tight text-ink">
                {COMPANY.name}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[28px] font-bold leading-none tracking-tight text-ink">Factuur</p>
              <p className="eyebrow mt-1 text-[10px] text-slate">Invoice</p>
            </div>
          </div>

          {/* From / bill to / particulars. The right rail carries the numbers
              a bookkeeper looks for, behind its own hairline. */}
          <div className="mt-12 grid grid-cols-[1.1fr_1.1fr_1fr] gap-8">
            <div>
              <p className="eyebrow text-[10px] text-slate">From</p>
              <p className="mt-2 text-[14px] font-bold text-ink">{COMPANY.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate">
                {COMPANY.contact}
                <br />
                {COMPANY.city}
                <br />
                {COMPANY.email}
                <br />
                {COMPANY.phone}
              </p>
            </div>
            <div>
              <p className="eyebrow text-[10px] text-slate">Bill to</p>
              <p className="mt-2 text-[14px] font-bold text-ink">{invoice.billTo.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate">
                {invoice.billTo.attn && (
                  <>
                    Attn. {invoice.billTo.attn}
                    <br />
                  </>
                )}
                {invoice.billTo.address.map((line) => (
                  <span key={line}>
                    {line}
                    <br />
                  </span>
                ))}
                {invoice.billTo.email}
              </p>
            </div>
            <div className="border-l border-line pl-6">
              <p className="eyebrow text-[10px] text-slate">Invoice no.</p>
              <p className="mt-1 font-mono text-[13px] font-semibold text-indigo">{invoice.number}</p>
              <p className="eyebrow mt-4 text-[10px] text-slate">Date</p>
              <p className="mt-1 font-mono text-[13px] font-semibold text-ink">{dmy(invoice.date)}</p>
              <p className="eyebrow mt-4 text-[10px] text-slate">Due</p>
              <p className="mt-1 font-mono text-[13px] font-semibold text-ink">
                {dmy(invoiceDueDate(invoice))} · {invoice.dueDays} days
              </p>
              {invoice.reference && (
                <>
                  <p className="eyebrow mt-4 text-[10px] text-slate">Reference</p>
                  <p className="mt-1 font-mono text-[13px] font-semibold text-ink">{invoice.reference}</p>
                </>
              )}
            </div>
          </div>

          {/* The work. */}
          <table className="mt-12 w-full border-collapse">
            <thead>
              <tr className="bg-indigo-tint/60">
                <th className="eyebrow rounded-l px-4 py-2.5 text-left text-[10px] text-indigo">
                  Description
                </th>
                <th className="eyebrow px-4 py-2.5 text-right text-[10px] text-indigo">Qty</th>
                <th className="eyebrow px-4 py-2.5 text-right text-[10px] text-indigo">Rate</th>
                <th className="eyebrow rounded-r px-4 py-2.5 text-right text-[10px] text-indigo">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="px-4 py-4">
                    <p className="text-[14px] font-bold leading-snug text-ink">{line.title}</p>
                    {line.subtitle && (
                      <p className="mt-0.5 text-[12px] leading-snug text-slate">{line.subtitle}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-[13px] text-ink">{line.qty}</td>
                  <td className="px-4 py-4 text-right font-mono text-[13px] text-ink">
                    {euro(line.rate)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-[13px] font-semibold text-ink">
                    {euro(line.qty * line.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* The arithmetic, ending in the one block of colour on the sheet. */}
          <div className="mt-6 ml-auto w-[46%]">
            <div className="flex items-baseline justify-between px-4 py-1.5">
              <span className="text-[13px] text-slate">Subtotal</span>
              <span className="font-mono text-[13px] text-ink">{euro(subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between px-4 py-1.5">
              <span className="text-[13px] text-slate">BTW {invoice.vatRate}%</span>
              <span className="font-mono text-[13px] text-ink">{euro(vat)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-[10px] bg-indigo px-5 py-3.5">
              <span className="text-[14px] font-semibold text-white">Total due</span>
              <span className="font-mono text-[19px] font-bold text-white">{euro(total)}</span>
            </div>
          </div>

          {/* Payment, registration, terms: the bookkeeping band. */}
          <div className="mt-12 grid grid-cols-3 gap-8 rounded-card bg-paper px-8 py-6">
            <div>
              <p className="eyebrow text-[10px] text-slate">Payment</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ink">
                IBAN <span className="font-mono font-semibold">{COMPANY.payment.iban}</span>
                <br />
                BIC <span className="font-mono font-semibold">{COMPANY.payment.bic}</span>
                <br />
                Account holder {COMPANY.payment.holder}
              </p>
            </div>
            <div>
              <p className="eyebrow text-[10px] text-slate">Registration</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ink">
                KvK <span className="font-mono font-semibold">{COMPANY.registration.kvk}</span>
                <br />
                BTW-id <span className="font-mono font-semibold">{COMPANY.registration.btw}</span>
              </p>
              {COMPANY.registration.placeholder && (
                <p className="mt-1 text-[11px] leading-snug text-mute">
                  Placeholders — replace on registration
                </p>
              )}
            </div>
            <div>
              <p className="eyebrow text-[10px] text-slate">Terms</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ink">
                {COMPANY.invoice.terms.map((t) => (
                  <span key={t}>
                    {t.replace("{days}", String(invoice.dueDays))}
                    <br />
                  </span>
                ))}
              </p>
            </div>
          </div>

          {/* The strip again, quietly, at the foot. */}
          <div className="mt-auto flex items-center justify-between border-t border-line pt-5">
            <span className="flex items-center gap-2">
              <Mark size={14} className="text-indigo" />
              <span className="eyebrow text-[9px] text-slate">{COMPANY.legalNote}</span>
            </span>
            <span className="eyebrow text-[9px] text-slate">{COMPANY.site.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
