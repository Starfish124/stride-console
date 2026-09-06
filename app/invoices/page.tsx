import { PageHeading } from "@/components/WorkspaceUI";
import { Header } from "@/components/ui";
import { InvoiceBoard } from "@/components/InvoiceBoard";
import { listClients, listInvoices } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Finance" title="Invoices" description="Create, track, and follow up on your client invoices."/>

        <InvoiceBoard invoices={listInvoices()} clients={listClients()} />
      </main>
    </div>
  );
}
