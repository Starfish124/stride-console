import { Header } from "@/components/ui";
import { SequenceEditor } from "@/components/SequenceEditor";
import { ManualQueue } from "@/components/ManualQueue";
import { TemplateRequeue } from "@/components/TemplateRequeue";
import { AskStride } from "@/components/AskStride";
import { listSequences } from "@/lib/outreach/sequence";
import { listReplies } from "@/lib/outreach/replies";
import { waitingManualSteps, awaitingAnswer } from "@/lib/salesnav/manual";
import { listClients } from "@/lib/store";
import { Ramp } from "@/components/Ramp";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  // The editor cannot render an email step yet, and handing it one would drop
  // the step on the next save. So it is given the newest sequence it can hold
  // whole, and email sequences are edited from the sequencer page instead.
  const existing = listSequences().find((s) => !s.steps.some((step) => step.kind === "email"));
  const replies = listReplies();
  const unhandled = replies.filter((r) => !r.handled);

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
  const chase = awaitingAnswer(7);
  const waitingForThisSequence = existing
    ? waitingManualSteps().filter((m) => m.sequenceId === existing.id).length
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
            The console keeps the copy, so what goes out in a message answers
            to the same voice guide as what goes out in a post. LinkedIn steps
            are sent by a founder, by hand, against the lead book. Email steps
            are sent by the console itself, and the stop switch for those is on
            the sequencer page.
          </p>
        </section>

        {/* The queue. #drafts because that is what the menu has always called
            it, and until now that anchor pointed at nothing at all. */}
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
              Sent more than a week ago and nobody has said anything came back. Marking a
              reply on the person changes this by itself — nothing here is stored, it is
              counted fresh each time.
            </p>
          </section>
        ) : null}

        {/* Unconditional. The menu and the front page both link here, and an
            anchor that only exists on a busy day is a link that breaks on the
            quiet ones. */}
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

        <SequenceEditor
          initial={
            existing
              ? {
                  id: existing.id,
                  name: existing.name,
                  audience: existing.audience,
                  steps: existing.steps.filter(
                    (step): step is typeof step & { kind: "connect" | "message" | "inmail" } =>
                      step.kind !== "email",
                  ),
                }
              : undefined
          }
        />

        {existing ? (
          <section className="card-glass mt-8 rounded-card border border-line bg-white p-5">
            <p className="eyebrow text-slate">After changing the words</p>
            <p className="mb-4 mt-2 text-[15px] text-slate">
              A message already queued keeps the words it was queued with, because somebody
              may have it on their clipboard right now. To bring the queue up to date, forget
              what is waiting and let it be written again.
            </p>
            <TemplateRequeue sequenceId={existing.id} waiting={waitingForThisSequence} />
          </section>
        ) : null}

        <p className="eyebrow mb-2 mt-10 text-slate">Ask about the outreach</p>
        <AskStride />
      </main>
    </div>
  );
}
