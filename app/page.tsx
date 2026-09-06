import Link from "next/link";
import {
  listClients,
  listDrafts,
  listEvents,
  listInbox,
  listInvoices,
  listMyths,
  listNotes,
  listPostLog,
  listSignups,
} from "@/lib/store";
import { listProjects, listIssues, listRuns } from "@/lib/workspace/store";
import { listAudits } from "@/lib/seo/store";
import { unhandledCount } from "@/lib/outreach/replies";
import { buildCalendar, todayISO, KIND_LABELS } from "@/lib/calendar";
import { buildStats } from "@/lib/dashboard";
import { workspaceActions } from "@/lib/workspace-overview";
import { Header } from "@/components/ui";
import {
  PageHeading,
  SectionHeading,
  EmptyState,
} from "@/components/WorkspaceUI";
import { MobileBrief } from "@/components/MobileBrief";
import { ActionQueue } from "@/components/ActionQueue";
import { RecipeCard } from "@/components/RecipeCard";
import { MythQuickAdd } from "@/components/MythQuickAdd";
import { InboxBanner } from "@/components/InboxBanner";
import { Glyph } from "@/components/icons";
import { Mark } from "@/components/Ramp";
import { STAGE_LABELS, invoiceTotal } from "@/lib/types";
import { euro } from "@/lib/company";
export const dynamic = "force-dynamic";
export default function Dashboard() {
  const today = todayISO();
  const clients = listClients();
  const drafts = listDrafts();
  const postLog = listPostLog();
  const audits = listAudits().filter((a) => a.ok);
  const notes = listNotes();
  const calendar = buildCalendar(
    { clients, events: listEvents(), signups: listSignups(), postLog },
    today,
  );
  const actions = workspaceActions(calendar, drafts, unhandledCount(), today);
  const upcoming = calendar
    .filter((e) => e.actionable && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const activeClients = clients
    .filter((c) => c.stage !== "past")
    .sort((a, b) => (a.nextStep ?? "9999").localeCompare(b.nextStep ?? "9999"))
    .slice(0, 4);
  const stats = buildStats({
    clients,
    postLog,
    siteScore: audits.length
      ? Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length)
      : null,
    pages: audits.length,
    drafts: drafts.length,
    awaitingApproval: drafts.filter((d) => d.status === "draft").length,
  });
  const unpaid = listInvoices().filter((i) => i.status === "sent");
  const projects = listProjects().filter(p => clients.some(c => c.id === p.clientId && c.stage !== "past")).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const issues = listIssues().filter(i => i.status === "open");
  const runs = listRuns();
  const doing = notes.filter((n) => n.lane === "doing");
  const date = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="min-h-dvh bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main overview-main">
        <PageHeading
          eyebrow="YOUR WORKSPACE"
          title="Your day, in focus."
          description="A clear view of the work that moves Stride forward."
        >
          <span className="today-label">
            <Glyph name="IconTime" size={16} />
            {date}
          </span>
          <Link className="primary-button" href="#create-content">
            <Glyph name="IconBolt" size={17} />
            Create content
          </Link>
        </PageHeading>
        <MobileBrief date={date} actions={actions} activeClients={clients.filter(c => c.stage !== "past").length} approvals={drafts.filter(d => d.status === "draft").length} unpaid={unpaid.length} doing={doing.length} />
        <InboxBanner entries={listInbox().filter((e) => !e.seen)} />
        <div className="overview-top">
          <ActionQueue actions={actions} />
          <aside className="overview-aside">
            <Link href="/ask" className="assistant-card">
              <div className="assistant-card-top">
                <span>BUILT AROUND YOUR WORK</span>
                <Glyph name="IconChevron" size={18} />
              </div>
              <Mark size={66} />
              <h2>
                A little clarity. <br />A lot of possibility.
              </h2>
              <p>
                Ask Stride about your clients, projects, and what needs to
                happen next.
              </p>
              <span className="assistant-cta">
                Let’s figure it out
                <Glyph name="IconAskStride" size={19} />
              </span>
            </Link>
            <Link href="/notes" className="working-note">
              <span className="action-icon">
                <Glyph name="IconBranch" size={19} />
              </span>
              <span>
                <strong>
                  {doing.length
                    ? `${doing.length} ${doing.length === 1 ? "idea" : "ideas"} in progress`
                    : "Make space for your next idea"}
                </strong>
                <small>
                  {doing[0]?.text ?? "Capture it on your shared notes board."}
                </small>
              </span>
              <Glyph name="IconChevron" size={15} />
            </Link>
          </aside>
        </div>
        <section className="overview-metrics" aria-label="Business overview">
          {stats.map((s) => (
            <Link key={s.label} href={s.href}>
              <span className="metric-label">
                {s.label}
                <Glyph name="IconChevron" size={13} />
              </span>
              <strong>{s.value}</strong>
              <small>{s.note}</small>
            </Link>
          ))}
        </section>
        <div className="overview-bottom">
          <section className="workspace-panel">
            <SectionHeading
              title="Client work"
              subtitle="Keep your next step close."
              href="/clients"
              action="All clients"
            />
            {activeClients.length === 0 ? (
              <EmptyState
                icon="IconTeam"
                title="Good work starts with a conversation"
                description="Add your first client or lead. Their next steps and project work will stay together here."
                href="/clients"
                action="Add your first client"
              />
            ) : (
              <ul className="client-work-list">
                {activeClients.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`}>
                      <span className="client-monogram">
                        {(c.company || c.name).slice(0, 2).toUpperCase()}
                      </span>
                      <span className="action-copy">
                        <strong>{c.company || c.name}</strong>
                        <small>
                          {c.nextStepNote ||
                            c.need ||
                            "Set the next step to keep things moving."}
                        </small>
                      </span>
                      <span className="status-label">
                        {STAGE_LABELS[c.stage]}
                      </span>
                      <Glyph name="IconChevron" size={15} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="workspace-panel agenda-panel" id="home-agenda">
            <SectionHeading
              title="Coming up"
              href="/calendar"
              action="Calendar"
            />
            {upcoming.length === 0 ? (
              <EmptyState
                icon="IconTime"
                title="A little breathing room"
                description="Client follow-ups and event dates will appear here as you plan them."
                href="/calendar"
                action="View your calendar"
                compact
              />
            ) : (
              <ul className="agenda-list">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <Link href={e.href ?? "/calendar"}>
                      <span className="agenda-date">
                        <small>
                          {new Date(`${e.date}T12:00:00Z`).toLocaleDateString(
                            "en-GB",
                            { month: "short" },
                          )}
                        </small>
                        <strong>{e.date.slice(8)}</strong>
                      </span>
                      <span>
                        <small>{KIND_LABELS[e.kind]}</small>
                        <strong>{e.title}</strong>
                        <span>{e.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {unpaid.length > 0 && (
              <Link href="/invoices" className="invoice-reminder">
                <Glyph name="IconLineageDoc" size={17} />
                {euro(unpaid.reduce((s, i) => s + invoiceTotal(i), 0))} awaiting
                payment
                <Glyph name="IconChevron" size={14} />
              </Link>
            )}
          </section>
        </div>
        {projects.length > 0 && <section className="workspace-panel home-projects">
          <SectionHeading title="Work in motion" subtitle="Your recently updated projects." href="/workspaces" action="All projects" />
          <ul className="client-work-list">{projects.slice(0,4).map(project => {
            const client = clients.find(c => c.id === project.clientId);
            const openIssues = issues.filter(i => i.projectId === project.id).length;
            const running = runs.some(r => r.projectId === project.id && r.status === "running");
            return <li key={project.id}><Link href={`/clients/${project.clientId}/workspace`}>
              <span className="action-icon"><Glyph name="IconIntegration" size={20} /></span>
              <span className="action-copy"><strong>{project.name}</strong><small>{client?.company || client?.name}{running ? " · Running now" : openIssues ? ` · ${openIssues} open issues` : " · Open workspace"}</small></span>
              <Glyph name="IconChevron" size={16} />
            </Link></li>;
          })}</ul>
        </section>}
        <section id="create-content" className="create-section">
          <SectionHeading
            title="Make something worth sharing"
            subtitle="Your sources. Your voice. Ready for your review."
            href="/library"
            action="Content library"
          />
          <div className="recipe-grid">
            {[
              { index: "01", id: "tldr", title: "The Stride TLDR" },
              { index: "02", id: "news", title: "Breaking This Week" },
              { index: "03", id: "myth", title: "Myth vs Reality" },
            ].map((r) => (
              <RecipeCard key={r.id} {...r} />
            ))}
          </div>
          <details className="myth-capture">
            <summary>
              Heard a myth worth unpacking?{" "}
              <span>
                {listMyths().filter((m) => !m.used).length} in your bank
              </span>
            </summary>
            <div>
              <MythQuickAdd />
            </div>
          </details>
        </section>
        <footer className="workspace-footnote">
          <Mark size={16} />
          <span>Make room for more.</span>
          <Link href="/settings">Manage your workspace</Link>
        </footer>
      </main>
    </div>
  );
}
