"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  invoiceTotal,
  type Client,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/types";
import { COMPANY, euro } from "@/lib/company";
import { DeleteX } from "@/components/DeleteX";

/**
 * Invoices, in the approved template's clothes.
 *
 * The form asks only what changes per invoice: who, the lines, the dates.
 * Everything company-side (IBAN, KvK, terms) lives in lib/company.ts and is
 * stamped on at print time. Picking a client from the book prefills the
 * bill-to block, because the client book already knows who they are.
 */

interface DraftLine {
  title: string;
  subtitle: string;
  qty: string;
  rate: string;
}

const EMPTY_LINE: DraftLine = { title: "", subtitle: "", qty: "1", rate: "125" };

const STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-line/40 text-slate",
  sent: "bg-amber/20 text-ink",
  paid: "bg-lime/20 text-ink",
};

function InvoiceForm({ clients, done }: { clients: Client[]; done: () => void }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [attn, setAttn] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDays, setDueDays] = useState(String(COMPANY.invoice.defaultDueDays));
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [busy, setBusy] = useState(false);

  const field =
    "w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-indigo/40";

  // Comma decimals are the Dutch keyboard's default; a billing tool that
  // rejects "1,5" silently would be lying about its own country.
  const num = (v: string) => Number(v.replace(",", "."));
  const rows = lines.map((l) => {
    const qty = num(l.qty);
    const rate = num(l.rate);
    const touched = Boolean(l.title.trim() || l.qty.trim() || l.rate.trim());
    const valid =
      Boolean(l.title.trim()) && Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate >= 0;
    return { line: l, qty, rate, touched, valid };
  });
  // A row someone started but that cannot be billed blocks the whole form —
  // dropping it from the invoice silently is how a client gets a short bill.
  const broken = rows.filter((r) => r.touched && !r.valid);
  const parsed = rows
    .filter((r) => r.valid)
    .map((r) => ({
      title: r.line.title.trim(),
      subtitle: r.line.subtitle.trim() || undefined,
      qty: r.qty,
      rate: r.rate,
    }));
  const total = invoiceTotal({ lines: parsed, vatRate: COMPANY.invoice.vatRate });

  function pickClient(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    setName(c.company || c.name);
    setAttn(c.company ? c.name : "");
    setEmail(c.email ?? "");
  }

  return (
    <form
      className="mt-4 space-y-3 rounded-card border border-line bg-white p-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (busy || !name.trim() || parsed.length === 0) return;
        setBusy(true);
        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId: clientId || undefined,
            billTo: { name, attn, address, email },
            date,
            dueDays: Number(dueDays),
            reference,
            lines: parsed,
            vatRate: COMPANY.invoice.vatRate,
          }),
        });
        setBusy(false);
        if (res.ok) {
          const created = (await res.json()) as Invoice;
          done();
          router.push(`/invoices/${created.id}/print`);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={clientId} onChange={(e) => pickClient(e.target.value)} className={field}>
          <option value="">From the client book…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company ? `${c.company} — ${c.name}` : c.name}
            </option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Billed to (company)" aria-label="Billed to" className={field} />
        <input value={attn} onChange={(e) => setAttn(e.target.value)} placeholder="Attn. (person or Finance)" aria-label="Attention of" className={field} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="finance@client.nl" aria-label="Billing email" className={field} />
      </div>
      <textarea
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder={"Street 1\n1000 AA Amsterdam"}
        rows={2}
        className={field}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="eyebrow text-[10px] text-slate">Invoice date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="block">
          <span className="eyebrow text-[10px] text-slate">Due, days</span>
          <input type="number" min={1} value={dueDays} onChange={(e) => setDueDays(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="block">
          <span className="eyebrow text-[10px] text-slate">Reference / PO</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO-0000" className={`${field} mt-1`} />
        </label>
      </div>

      <div className="space-y-2">
        <span className="eyebrow text-[10px] text-slate">Lines</span>
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_6rem_auto] gap-2">
            <div className="space-y-1">
              <input
                value={line.title}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, title: e.target.value } : l)))}
                placeholder="AI workflow discovery"
                className={field}
              />
              <input
                value={line.subtitle}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, subtitle: e.target.value } : l)))}
                placeholder="Workshop, mapping and instrumentation plan"
                className={`${field} text-[13px]`}
              />
            </div>
            <input
              value={line.qty}
              onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l)))}
              placeholder="Qty"
              inputMode="decimal"
              aria-label="Quantity"
              aria-invalid={rows[i]?.touched && !rows[i].valid ? true : undefined}
              className={`${field} ${rows[i]?.touched && !rows[i].valid ? "border-amber-deep" : ""}`}
            />
            <input
              value={line.rate}
              onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, rate: e.target.value } : l)))}
              placeholder="Rate €"
              inputMode="decimal"
              aria-label="Rate in euro"
              aria-invalid={rows[i]?.touched && !rows[i].valid ? true : undefined}
              className={`${field} ${rows[i]?.touched && !rows[i].valid ? "border-amber-deep" : ""}`}
            />
            <button
              type="button"
              aria-label="Remove line"
              onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}
              className="pressable self-start rounded px-2 py-2 text-sm text-mute hover:text-amber"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
          className="pressable rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate hover:text-indigo"
        >
          + Line
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-sm text-slate">
          Total incl. BTW {COMPANY.invoice.vatRate}%:{" "}
          <span className="font-mono font-semibold text-ink">{euro(total)}</span>
          {broken.length > 0 && (
            <span className="block font-semibold text-amber-deep">
              {broken.length === 1 ? "One line" : `${broken.length} lines`} can&apos;t be billed yet —
              every started line needs a title, a quantity and a rate.
            </span>
          )}
        </p>
        <button
          type="submit"
          disabled={busy || !name.trim() || parsed.length === 0 || broken.length > 0}
          className="pressable rounded-full bg-indigo px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Create and open
        </button>
      </div>
    </form>
  );
}

export function InvoiceBoard({ invoices, clients }: { invoices: Invoice[]; clients: Client[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const [saveFailed, setSaveFailed] = useState(false);

  async function setStatus(id: string, status: InvoiceStatus) {
    let ok = false;
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    setSaveFailed(!ok);
    if (ok) router.refresh();
  }

  const outstanding = invoices
    .filter((i) => i.status === "sent")
    .reduce((s, i) => s + invoiceTotal(i), 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-slate">
          {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
          {outstanding > 0 && <> · {euro(outstanding)} out the door, unpaid</>}
        </p>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="pressable rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo"
        >
          {adding ? "Close" : "New invoice"}
        </button>
      </div>

      {saveFailed && (
        <p className="mt-2 text-sm font-semibold text-amber-deep">
          That change did not save. Check the connection and try again.
        </p>
      )}

      {adding && <InvoiceForm clients={clients} done={() => setAdding(false)} />}

      {invoices.length === 0 && !adding && (
        <div className="mt-6 rounded-card border border-dashed border-line bg-white/60 p-8 text-center text-slate">
          <p className="display text-lg text-ink">Nothing billed yet.</p>
          <p className="mt-1 text-sm">
            New invoice → pick the client → lines → it opens print-ready in the approved template.
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {invoices.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3">
            <Link
              href={`/invoices/${inv.id}/print`}
              className="font-mono text-sm font-semibold text-indigo underline-offset-2 hover:underline"
            >
              {inv.number}
            </Link>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {inv.billTo.name}
            </span>
            <span className="font-mono text-sm text-ink">{euro(invoiceTotal(inv))}</span>
            <span className="eyebrow hidden text-[10px] text-mute sm:inline">{inv.date}</span>
            <span className="flex gap-1">
              {INVOICE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void setStatus(inv.id, s)}
                  aria-pressed={inv.status === s}
                  className={`pressable min-h-[36px] rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    inv.status === s ? STATUS_TONE[s] : "text-slate hover:text-ink"
                  }`}
                >
                  {INVOICE_STATUS_LABELS[s]}
                </button>
              ))}
            </span>
            <DeleteX
              url={`/api/invoices?id=${inv.id}`}
              ask={`Delete invoice ${inv.number}? The number will be reused.`}
              label="Delete invoice"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
