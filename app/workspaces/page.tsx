import { EmptyState, PageHeading } from "@/components/WorkspaceUI";
import Link from "next/link";
import { Header } from "@/components/ui";

import { Glyph } from "@/components/icons";
import { WorkspaceSearch } from "@/components/WorkspaceSearch";
import { listClients } from "@/lib/store";
import { listIssues, listProjects, listRuns } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export default function WorkspacesPage() {
  const clients = listClients();
  const projects = listProjects();
  const runs = listRuns();
  const openIssues = listIssues().filter((i) => i.status === "open");

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Delivery" title="Projects & workspaces" description="Client files, project progress, and the people moving the work forward."/>


        <WorkspaceSearch />

        {clients.length === 0 ? (
          <div className="workspace-panel"><EmptyState icon="IconIntegration" title="A home for every project" description="Add a client to bring their files, projects, and delivery work together in one workspace." href="/clients" action="Go to clients"/></div>
        ) : (
          <ul className="inset-group">
            {clients.map((client) => {
              const own = projects.filter((p) => p.clientId === client.id);
              const last = runs.find((r) => r.clientId === client.id);
              const issues = openIssues.filter((i) => i.clientId === client.id).length;
              return (
                <li key={client.id}>
                  <Link
                    href={`/clients/${client.id}/workspace`}
                    className="flex min-h-11 items-center gap-3 px-4 py-3 pressable"
                  >
                    <Glyph name="IconIntegration" size={18} className="text-slate" />
                    <span className="flex-1 truncate text-sm text-ink">{client.company}</span>
                    <span className="tabular text-xs text-mute">
                      {own.length === 0
                        ? "no projects"
                        : `${own.length} project${own.length > 1 ? "s" : ""}`}
                      {last && ` · last run ${last.startedAt.slice(0, 10)}`}
                      {issues > 0 && ` · ${issues} open issue${issues > 1 ? "s" : ""}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
