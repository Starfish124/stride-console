import { notFound } from "next/navigation";
import { Mark } from "@/components/Ramp";
import { COMPANY, euro } from "@/lib/company";
import { resolvePortalToken } from "@/lib/portal";
import { getClient, listInvoices } from "@/lib/store";
import { INVOICE_STATUS_LABELS, STAGE_LABELS, invoiceTotal } from "@/lib/types";
import { listProjects, listRuns } from "@/lib/workspace/store";
import type { RunLog, RunStatus } from "@/lib/workspace/types";

/**
 * The client-facing portal: one client's engagement, read-only, behind a
 * minted link. No console chrome and no Header on purpose. This page is the
 * one surface an outsider ever sees, so everything on it is filtered by the
 * clientId the token resolves to, and nothing on it is editable.
 *
 * Runs render as task + status + date only. Transcripts, diffs and audit
 * findings never leave the console: they can carry other clients' names,
 * hostnames and internals.
 */

export const dynamic = "force-dynamic";

/**
 * A capability URL must never end up in a search index, so the page says
 * noindex about itself. The token gets resolved here too: a dead link then
 * renders the 404 boundary with a plain title instead of "Engagement portal".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!resolvePortalToken(token)) notFound();
  return { title: "Engagement portal", robots: { index: false, follow: false } };
}

/** Plain words a client understands, not our internal states. */
const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: "In progress",
  done: "Done",
  failed: "Needs another pass",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-8">
      <p className="eyebrow mb-4 text-slate">{title}</p>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-slate">{children}</p>;
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const clientId = resolvePortalToken(token);
  if (!clientId) notFound();
  const client = getClient(clientId);
  if (!client) notFound();

  // Everything below is scoped to this one client: the store filters
  // projects by clientId, runs by those projects' ids, invoices by clientId.
  const projects = listProjects(client.id);
  const runs: RunLog[] = projects
    .flatMap((p) => listRuns(p.id))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 10);
  const invoices = listInvoices().filter((i) => i.clientId === client.id);

  return (
    <div className="min-h-screen bg-paper">
      <main className="mx-auto max-w-2xl px-6 pb-16 pt-[calc(env(safe-area-inset-top)+3rem)]">
        <header className="pb-10">
          <div className="flex items-center gap-2.5">
            <Mark size={22} className="text-indigo" />
            <span className="eyebrow text-slate">{COMPANY.name}</span>
          </div>
          <h1 className="display mt-6 text-[2rem] text-ink">{client.company}</h1>
          <p className="mt-2 text-[14px] text-slate">
            Your engagement with {COMPANY.name}, as it stands today.
          </p>
        </header>

        <Section title="Where the engagement stands">
          <p className="text-[15px] font-semibold text-ink">
            {STAGE_LABELS[client.stage]}
          </p>
          {client.need && (
            <div className="mt-4">
              <p className="eyebrow mb-1.5 text-mute">What you asked for</p>
              <p className="text-[14px] leading-relaxed text-ink">{client.need}</p>
            </div>
          )}
          {client.proposed && (
            <div className="mt-4">
              <p className="eyebrow mb-1.5 text-mute">What we proposed</p>
              <p className="text-[14px] leading-relaxed text-ink">{client.proposed}</p>
            </div>
          )}
        </Section>

        <Section title="What we are building">
          {projects.length === 0 ? (
            <Quiet>Nothing on the bench yet. The first build lands here.</Quiet>
          ) : (
            <ul className="flex flex-col gap-4">
              {projects.map((p) => (
                <li key={p.id}>
                  <p className="text-[15px] font-semibold text-ink">{p.name}</p>
                  <p className="mt-0.5 text-[13px] text-slate">
                    {p.kind === "repo"
                      ? "Built inside your own repository."
                      : "Built from the files you handed over."}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent work">
          {runs.length === 0 ? (
            <Quiet>No sessions logged yet.</Quiet>
          ) : (
            <ul className="flex flex-col gap-4">
              {runs.map((r) => (
                <li key={r.id}>
                  <p className="text-[14px] leading-snug text-ink">
                    {r.task.length > 120
                      ? `${r.task.slice(0, 120).trimEnd()}…`
                      : r.task}
                  </p>
                  <p className="mt-0.5 text-[12px] text-mute">
                    {shortDate(r.startedAt)} · {RUN_STATUS_LABELS[r.status]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Invoices">
          {invoices.length === 0 ? (
            <Quiet>No invoices yet.</Quiet>
          ) : (
            <ul className="flex flex-col">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">
                      {inv.number}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-mute">
                      {shortDate(inv.date)} · {INVOICE_STATUS_LABELS[inv.status]}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold text-ink">
                    {euro(invoiceTotal(inv))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <footer className="border-t border-line pt-8">
          <p className="text-[13px] text-slate">
            Prepared by {COMPANY.name} · questions:{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-indigo hover:text-indigo-deep">
              {COMPANY.email}
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
