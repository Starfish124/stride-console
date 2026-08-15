import { Header } from "@/components/ui";
import { InvoiceBoard } from "@/components/InvoiceBoard";
import { listClients, listInvoices } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden py-10">
          <p className="eyebrow text-slate">Invoices</p>
          <h1 className="display mt-3 text-4xl text-ink">
            Bill it like we mean it.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Every invoice in the one approved template: pick the client, add the
            lines, and it opens print-ready. Numbering runs itself, the IBAN
            lives in one file, and sent-but-unpaid stays counted.
          </p>
        </section>
        <InvoiceBoard invoices={listInvoices()} clients={listClients()} />
      </main>
    </div>
  );
}
