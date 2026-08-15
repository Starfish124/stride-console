import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addInvoice, listInvoices, removeInvoice, updateInvoice } from "@/lib/store";
import { COMPANY } from "@/lib/company";
import { INVOICE_STATUSES, type Invoice, type InvoiceLine, type InvoiceStatus } from "@/lib/types";
import { FOUNDER_COOKIE } from "@/lib/auth";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isoDay(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function status(value: unknown): InvoiceStatus | undefined {
  return INVOICE_STATUSES.includes(value as InvoiceStatus) ? (value as InvoiceStatus) : undefined;
}

/** Lines arrive from a form; only sane, priced, titled lines survive. */
function lines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  const out: InvoiceLine[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const l = raw as Record<string, unknown>;
    const title = text(l.title);
    const qty = Number(l.qty);
    const rate = Number(l.rate);
    if (!title || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) continue;
    out.push({ title, subtitle: text(l.subtitle), qty, rate });
  }
  return out;
}

function billTo(value: unknown): Invoice["billTo"] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const b = value as Record<string, unknown>;
  const name = text(b.name);
  if (!name) return undefined;
  const address = Array.isArray(b.address)
    ? b.address.map((a) => (typeof a === "string" ? a.trim() : "")).filter(Boolean)
    : typeof b.address === "string"
      ? b.address.split("\n").map((a) => a.trim()).filter(Boolean)
      : [];
  return { name, attn: text(b.attn), address, email: text(b.email) };
}

export async function GET() {
  return NextResponse.json(listInvoices());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const to = billTo(body.billTo);
  if (!to) return NextResponse.json({ error: "Who is this for." }, { status: 400 });
  const billed = lines(body.lines);
  if (!billed.length) return NextResponse.json({ error: "Nothing on it." }, { status: 400 });
  const jar = await cookies();
  const invoice = addInvoice({
    clientId: text(body.clientId),
    billTo: to,
    date: isoDay(body.date) ?? new Date().toISOString().slice(0, 10),
    dueDays: Number.isFinite(Number(body.dueDays)) && Number(body.dueDays) > 0
      ? Math.round(Number(body.dueDays))
      : COMPANY.invoice.defaultDueDays,
    reference: text(body.reference),
    lines: billed,
    vatRate: Number.isFinite(Number(body.vatRate)) ? Number(body.vatRate) : COMPANY.invoice.vatRate,
    by: jar.get(FOUNDER_COOKIE)?.value,
  });
  return NextResponse.json(invoice);
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which invoice." }, { status: 400 });

  const patch: Parameters<typeof updateInvoice>[1] = {};
  const st = status(body.status);
  if (st) patch.status = st;
  const to = billTo(body.billTo);
  if (to) patch.billTo = to;
  if (isoDay(body.date)) patch.date = isoDay(body.date);
  if ("reference" in body) patch.reference = text(body.reference);
  if (Number.isFinite(Number(body.dueDays)) && Number(body.dueDays) > 0) {
    patch.dueDays = Math.round(Number(body.dueDays));
  }
  if ("lines" in body) {
    const billed = lines(body.lines);
    if (!billed.length) return NextResponse.json({ error: "Nothing on it." }, { status: 400 });
    patch.lines = billed;
  }

  const invoice = updateInvoice(id, patch);
  if (!invoice) return NextResponse.json({ error: "No such invoice." }, { status: 404 });
  return NextResponse.json(invoice);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!removeInvoice(id)) {
    return NextResponse.json({ error: "No such invoice." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
