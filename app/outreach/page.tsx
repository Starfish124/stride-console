import Link from "next/link";
import { Header } from "@/components/ui";
import { SequenceEditor } from "@/components/SequenceEditor";
import { ManualQueue } from "@/components/ManualQueue";
import { TemplateRequeue } from "@/components/TemplateRequeue";
import { AskStride } from "@/components/AskStride";
import { EngineLight } from "@/components/EngineLight";
import { listSequences } from "@/lib/outreach/sequence";
import { listReplies } from "@/lib/outreach/replies";
import { waitingManualSteps, awaitingAnswer } from "@/lib/salesnav/manual";
import { reach, reachBySequence } from "@/lib/salesnav/engine";
import { listClients } from "@/lib/store";
import { Ramp } from "@/components/Ramp";

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
    ? waitingManualSteps().filter((m) => m.sequenceId === chosen.id).length
    : 0;

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Outreach</p>
          <h1 className="display mt-3 text-3xl text-ink">The words you send.</h1>
          <p className="mt-3 text-[15px] text-slate">
            Apollo finds the people and the console keeps the copy, so a message answers to the
            same voice guide as a post. Nothing here sends on LinkedIn — the account that gets
            restricted for that is your own, and the Sales Navigator seat hangs off it.
          </p>
          <div className="mt-4">
            <EngineLight />
          </div>
        </section>

        <dl className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            { label: "Sent", value: totals.sent },
            { label: "Waiting", value: totals.waiting },
            { label: "In a sequence", value: totals.active },
            { label: "Replied", value: totals.replied },
            { label: "Finished", value: totals.finished },
            { label: "Skipped", value: totals.skipped },
          ].map((f) => (
            <div key={f.label} className="card-raised rounded-card border border-line bg-white px-3 py-2.5">
              <dd className="figure text-[21px] text-ink">{f.value}</dd>
              <dt className="eyebrow mt-1 text-slate">{f.label}</dt>
            </div>
          ))}
        </dl>

        {/* The sequences, side by side, because there are two jobs here and
            picking the wrong one wastes an InMail credit or a connection. */}
        <section className="mb-8">
          <p className="eyebrow mb-2 text-slate">Sequences</p>
          <div className="inset-group">
            {sequences.map((s) => {
              const mine = reachBySequence(s.id);
              const active = chosen?.id === s.id;
              return (
                <Link
                  key={s.id}
                  href={`/outreach?seq=${s.id}`}
                  className={`flex min-h-[44px] items-center gap-3 px-4 py-3 hover:bg-paper ${
                    active ? "bg-indigo-tint/40" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{s.name}</span>
                    <span className="mt-0.5 block text-[12px] text-slate">
                      {s.steps.map((step) => `${step.kind} +${step.waitDays}d`).join(" → ")}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[12px] text-slate">
                    {mine.sent} sent · {mine.waiting} waiting
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/outreach?new=invite"
              className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink"
            >
              New invite sequence
            </Link>
            <Link
              href="/outreach?new=inmail"
              className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink"
            >
              New InMail sequence
            </Link>
          </div>
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

        <p className="eyebrow mb-2 mt-10 text-slate">Ask about the outreach</p>
        <AskStride />
      </main>
    </div>
  );
}
