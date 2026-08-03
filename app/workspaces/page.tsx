import Link from "next/link";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { Glyph } from "@/components/icons";
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
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Delivery</p>
          <h1 className="display mt-3 text-4xl text-ink">Workspaces</h1>
          <p className="mt-2 max-w-xl text-slate">
            Every client&apos;s project files live here, on this machine, with the runner
            that works on them. Open a client to drop files in or set a run going.
          </p>
        </section>

        {clients.length === 0 ? (
          <p className="text-sm text-mute">
            No clients in the book yet. Add one on the Clients board first.
          </p>
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
