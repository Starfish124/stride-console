import { listClients, overdueClients, pipelineValue } from "@/lib/store";
import { Header } from "@/components/ui";
import { PageHeading } from "@/components/WorkspaceUI";
import { ClientsBoard } from "@/components/ClientsBoard";
export const dynamic = "force-dynamic";
export default function ClientsPage() {
  const clients = listClients();
  const totals = pipelineValue(clients);
  const late = overdueClients(clients);
  return (
    <div className="min-h-dvh bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading
          eyebrow="Relationships"
          title="Clients & leads"
          description="Good conversations, clear next steps. Keep every relationship moving."
        />
        <section
          className="overview-metrics client-metrics"
          aria-label="Pipeline summary"
        >
          {[
            {
              label: "Relationships",
              value: clients.length,
              note: "Across every stage",
            },
            {
              label: "Open pipeline",
              value: clients.some(
                (c) =>
                  c.value !== undefined &&
                  ["lead", "talking", "proposal"].includes(c.stage),
              )
                ? `€${(totals.lead + totals.talking + totals.proposal).toLocaleString("en-GB")}`
                : "—",
              note: "Leads, conversations & proposals",
            },
            {
              label: "Won",
              value: clients.some(
                (c) => c.stage === "client" && c.value !== undefined,
              )
                ? `€${totals.client.toLocaleString("en-GB")}`
                : "—",
              note: "Active client value",
            },
            {
              label: "Follow-ups due",
              value: late.length,
              note: "Past the next step date",
            },
          ].map((s) => (
            <div key={s.label}>
              <span className="metric-label">{s.label}</span>
              <strong>{s.value}</strong>
              <small>{s.note}</small>
            </div>
          ))}
        </section>
        <ClientsBoard clients={clients} />
      </main>
    </div>
  );
}
