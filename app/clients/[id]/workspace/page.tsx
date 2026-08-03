import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/store";
import { listProjects } from "@/lib/workspace/store";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { NewProjectForm } from "@/components/NewProjectForm";
import { RunnerPanel } from "@/components/RunnerPanel";
import { WorkspaceFiles } from "@/components/WorkspaceFiles";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) notFound();

  const projects = listProjects(id);
  const { p } = await searchParams;
  const selected = projects.find((project) => project.id === p) ?? projects[0];

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <Link href={`/clients/${client.id}`} className="eyebrow text-slate hover:text-indigo">
            ← {client.company}
          </Link>
          <h1 className="title-large mt-3 text-ink">Workspace</h1>
          <p className="mt-2 max-w-xl text-slate">
            {client.company}&apos;s files and projects on this machine.
          </p>
        </section>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/clients/${client.id}/workspace?p=${project.id}`}
              className={`rounded-input border px-3 py-1.5 text-sm pressable ${
                selected?.id === project.id
                  ? "border-indigo bg-indigo-tint text-indigo"
                  : "border-line bg-white text-slate"
              }`}
            >
              {project.name}
            </Link>
          ))}
          <NewProjectForm clientId={client.id} />
        </div>

        {selected ? (
          <div className="space-y-6 xl:grid xl:grid-cols-[1.4fr_1fr] xl:items-start xl:gap-6 xl:space-y-0">
            <WorkspaceFiles key={selected.id} projectId={selected.id} />
            <RunnerPanel key={`run-${selected.id}`} projectId={selected.id} />
          </div>
        ) : (
          <p className="text-sm text-mute">
            No projects yet. Create one and drop the files in.
          </p>
        )}
      </main>
    </div>
  );
}
