import Link from "next/link";
import { Header } from "@/components/ui";
import { SequenceEditor } from "@/components/SequenceEditor";
import { ManualQueue } from "@/components/ManualQueue";
import { TemplateRequeue } from "@/components/TemplateRequeue";
import { EngineLight } from "@/components/EngineLight";
import { listSequences } from "@/lib/outreach/sequence";
import { listReplies } from "@/lib/outreach/replies";
import { waitingManualSteps, awaitingAnswer } from "@/lib/salesnav/manual";
import { reach, engineStatus } from "@/lib/salesnav/engine";
import { listManualSteps, listEnrolments } from "@/lib/salesnav/store";
import { listClients } from "@/lib/store";

export const dynamic = "force-dynamic";

/** How long after sending before silence is worth noticing. */
const CHASE_AFTER_DAYS = 7;

/**
 * Two shapes of outreach, and they are genuinely different jobs.
 *
 * An invite has to earn a connection in 300 characters before it can say
 * anything. An InMail needs no connection at all and has room to make the
 * whole case — but the credits are scarce, so it is what you spend on someone
 * who ignored the invite, not the opener.
 */
const PRESETS = {
  invite: {
    name: "",
    audience: "",
    steps: [
      { kind: "connect" as const, waitDays: 0, body: "" },
      { kind: "message" as const, waitDays: 3, body: "" },
      { kind: "message" as const, waitDays: 5, body: "" },
    ],
  },
  inmail: {
    name: "",
    audience: "",
    steps: [
      { kind: "inmail" as const, waitDays: 0, body: "" },
      { kind: "message" as const, waitDays: 6, body: "" },
    ],
  },
};

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ seq?: string; new?: string }>;
}) {
  const { seq, new: preset } = await searchParams;

  // The editor cannot render an email step yet, and handing it one would drop
  // the step on the next save. Email sequences are edited on the sequencer page.
  const sequences = listSequences().filter((s) => !s.steps.some((step) => step.kind === "email"));
  const chosen = sequences.find((s) => s.id === seq) ?? (preset ? undefined : sequences[0]);
  const starting = preset === "inmail" ? PRESETS.inmail : preset === "invite" ? PRESETS.invite : undefined;

  const replies = listReplies();
  const unhandled = replies.filter((r) => !r.handled);
  const totals = reach();
  const engine = engineStatus();

  // One read of the ledger, shared by every count on the page. Asking per
  // sequence re-read the whole file each time for numbers nobody acts on.
  const allSteps = listManualSteps();
  const enrolments = listEnrolments();
  const byId = new Map(listClients().map((c) => [c.id, c]));
  const queue = waitingManualSteps().map((m) => ({
    key: m.key,
    kind: m.kind,
    who: byId.get(m.clientId)
      ? `${byId.get(m.clientId)!.company} · ${byId.get(m.clientId)!.name}`
      : m.clientId,
    profileUrl: m.profileUrl,
    body: m.body,
    dueAt: m.dueAt,
  }));
  const chase = awaitingAnswer(CHASE_AFTER_DAYS);
  const waitingHere = chosen
    ? allSteps.filter((m) => m.sequenceId === chosen.id && m.state === "waiting").length
    : 0;

  // The one next thing.
  //
  // The order matters more than anything else here. The queue comes first
  // because queued words need no clock — they are written and merged already —
  // and ranking a machine-health warning above them hides ready messages behind
  // a state that is true after every reboot.
  //
  // The second rung is the one that did not exist. A held step is invisible
  // everywhere, so an empty queue with people enrolled used to read as "enrol
  // more" or "widen the search", both of which spend Apollo credits to fix what
  // is usually a missing field on one client record.
  const activeCount = enrolments.filter((e) => e.state === "active").length;
  const next =
    queue.length > 0
      ? {
          title: `${queue.length} message${queue.length === 1 ? "" : "s"} waiting on you.`,
          detail: "Copy it, send it in LinkedIn, then say so. Ten seconds each.",
          href: "#queue",
          cta: "Work the queue",
        }
      : activeCount > 0
        ? {
            title: "Enrolled, but nothing is queued.",
            detail:
              "The runner is holding somebody back — usually a missing field on a client record, a merged message over the limit, or the day's cap already spent.",
            href: "/salesnav",
            cta: "Open the engine room",
          }
        : engine.state === "stopped" || engine.state === "no-clock"
          ? {
              title: engine.state === "stopped" ? "The engine is stopped." : "The engine has no clock.",
              detail: engine.detail,
              href: "/salesnav",
              cta: "Open the engine room",
            }
          : sequences.length === 0
            ? {
                title: "No sequence written yet.",
                detail:
                  "Write the words once and everyone gets them with their own details filled in.",
                href: "/outreach?new=invite",
                cta: "Write one",
              }
            : {
                title: "Nobody is in a sequence.",
                detail: "Pick people from the lead book and put them in one. Nothing sends by itself.",
                href: "/leads",
                cta: "Choose who to write to",
              };

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3 py-6">
          <div>
            <p className="eyebrow text-slate">Apollo outreach</p>
            <h1 className="display mt-1 text-[26px] text-ink">Sequences and the queue</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/leads"
              className="pressable inline-flex min-h-[38px] items-center rounded-input border border-line bg-white px-4 text-[14px] text-ink"
            >
              Lead book
            </Link>
            <Link
              href="/outreach?new=invite"
              className="pressable inline-flex min-h-[38px] items-center rounded-input border border-line bg-white px-4 text-[14px] text-ink"
            >
              New sequence
            </Link>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line py-3">
          <EngineLight />
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { label: "Sent", value: totals.sent },
              { label: "Waiting", value: totals.waiting },
              { label: "In a sequence", value: totals.active },
              { label: "Replied", value: totals.replied },
            ].map((f) => (
              <div key={f.label} className="flex items-baseline gap-1.5">
                <span className="num text-[15px] text-ink">{f.value}</span>
                <span className="eyebrow text-slate">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* The sequences, as a rail. Two shapes of outreach, and picking the
              wrong one wastes a connection or an InMail credit. */}
          <aside className="flex flex-col gap-3">
            <div className="rounded-card border border-line bg-paper p-3">
              <p className="eyebrow mb-2 px-1 text-slate">Sequences</p>
              <div className="inset-group">
                {sequences.map((q) => {
                  const mine = {
                    sent: allSteps.filter((m) => m.sequenceId === q.id && m.state === "done").length,
                    waiting: allSteps.filter((m) => m.sequenceId === q.id && m.state === "waiting").length,
                  };
                  return (
                    <Link
                      key={q.id}
                      href={`/outreach?seq=${q.id}`}
                      className={`flex min-h-[44px] flex-col justify-center gap-0.5 px-3 py-2 hover:bg-paper ${
                        chosen?.id === q.id ? "bg-indigo-tint/40" : ""
                      }`}
                    >
                      <span className="truncate text-[14px] text-ink">{q.name}</span>
                      <span className="text-[11px] text-slate">
                        {q.steps.map((step) => `${step.kind} +${step.waitDays}d`).join(" → ")}
                      </span>
                      <span className="num text-[11px] text-mute">
                        {mine.sent} sent · {mine.waiting} waiting
                      </span>
                    </Link>
                  );
                })}
                {sequences.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-slate">None written yet.</p>
                ) : null}
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <Link
                  href="/outreach?new=invite"
                  className="pressable rounded-input border border-line bg-white px-3 py-2 text-center text-[13px] text-ink"
                >
                  New invite sequence
                </Link>
                <Link
                  href="/outreach?new=inmail"
                  className="pressable rounded-input border border-line bg-white px-3 py-2 text-center text-[13px] text-ink"
                >
                  New InMail sequence
                </Link>
              </div>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col gap-5">
        {/* What to do, above anything that reports on what was done. */}
        <section className="card-glass mb-8 rounded-card border border-indigo/25 bg-white p-5">
          <p className="display text-[19px] leading-snug text-ink">{next.title}</p>
          <p className="mt-1.5 text-[14px] leading-snug text-slate">{next.detail}</p>
          <Link
            href={next.href}
            className="pressable mt-4 inline-flex min-h-[44px] items-center rounded-input bg-ink px-5 text-[15px] font-semibold text-white"
          >
            {next.cta}
          </Link>
        </section>

        {/* The queue. #drafts because that is what the menu has always called
            it, and until recently that anchor pointed at nothing at all. */}
        <section id="drafts" className="mb-8 scroll-mt-6">
          <div id="queue" className="scroll-mt-6" />
          <p className="eyebrow mb-2 text-slate">
            Waiting on you{queue.length > 0 ? ` · ${queue.length}` : ""}
          </p>
          <ManualQueue steps={queue} />
        </section>

        {chase.length > 0 ? (
          <section className="card-glass mb-8 rounded-card border border-line bg-white p-5">
            <p className="eyebrow text-slate">No answer yet · {chase.length}</p>
            <p className="mt-2 text-[15px] text-slate">
              Sent more than a week ago with nothing recorded back. Marking a reply changes this
              by itself — it is counted fresh each time, never stored.
            </p>
          </section>
        ) : null}

        {/* Unconditional. The menu and the front page both link here, and an
            anchor that only exists on a busy day breaks on the quiet ones. */}
        <section
          id="replies"
          className={`card-glass mb-8 scroll-mt-6 rounded-card border bg-white p-5 ${
            unhandled.length > 0 ? "border-indigo-tint" : "border-line"
          }`}
        >
          {unhandled.length === 0 ? (
            <>
              <p className="eyebrow text-slate">Replies</p>
              <p className="mt-2 text-[15px] text-slate">
                Nothing waiting. An answer on LinkedIn only lands here if somebody says so —
                nothing in this console can read LinkedIn.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow text-indigo">
                {unhandled.length} repl{unhandled.length === 1 ? "y" : "ies"} waiting
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {unhandled.slice(0, 5).map((reply) => (
                  <li key={reply.id}>
                    <p className="text-[15px] font-semibold text-ink">
                      {reply.name ?? "Someone"}
                      {reply.headline ? (
                        <span className="font-normal text-slate"> · {reply.headline}</span>
                      ) : null}
                    </p>
                    {reply.message && (
                      <p className="mt-1 text-[14px] leading-snug text-ink">
                        {reply.message.slice(0, 220)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <p className="eyebrow mb-2 text-slate">
          {starting ? "New sequence" : chosen ? "Editing" : "Write one"}
        </p>
        <SequenceEditor
          key={starting ? `new-${preset}` : (chosen?.id ?? "blank")}
          initial={
            starting
              ? { id: "", ...starting }
              : chosen
                ? {
                    id: chosen.id,
                    name: chosen.name,
                    audience: chosen.audience,
                    steps: chosen.steps.filter(
                      (step): step is typeof step & { kind: "connect" | "message" | "inmail" } =>
                        step.kind !== "email",
                    ),
                  }
                : undefined
          }
        />

        {chosen ? (
          <section className="card-glass mt-8 rounded-card border border-line bg-white p-5">
            <p className="eyebrow text-slate">After changing the words</p>
            <p className="mb-4 mt-2 text-[15px] text-slate">
              A message already queued keeps the words it was queued with, because somebody may
              have it on their clipboard right now. To bring the queue up to date, forget what is
              waiting and let it be written again.
            </p>
            <TemplateRequeue sequenceId={chosen.id} waiting={waitingHere} />
          </section>
        ) : null}

          </section>
        </div>
      </main>
    </div>
  );
}
