import { Header } from "@/components/ui";
import { SequenceEditor } from "@/components/SequenceEditor";
import { listSequences } from "@/lib/outreach/sequence";
import { listReplies } from "@/lib/outreach/replies";
import { AiDraftQueue } from "@/components/AiDraftQueue";
import { Ramp } from "@/components/Ramp";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const existing = listSequences()[0];
  const replies = listReplies();
  const unhandled = replies.filter((r) => !r.handled);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Outreach</p>
          <h1 className="display mt-3 text-3xl text-ink">The words you send.</h1>
          <p className="mt-3 text-[15px] text-slate">
            Linked Helper keeps the schedule and does the sending. The console
            keeps the copy, so what goes out in a message answers to the same
            voice guide as what goes out in a post. Nothing is sent from here.
          </p>
        </section>

        {unhandled.length > 0 && (
          <section
            id="replies"
            className="card-glass mb-8 rounded-card border border-indigo-tint bg-white p-5"
          >
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
          </section>
        )}

        <AiDraftQueue />

        <SequenceEditor
          initial={
            existing
              ? {
                  id: existing.id,
                  name: existing.name,
                  audience: existing.audience,
                  steps: existing.steps,
                }
              : undefined
          }
        />
      </main>
    </div>
  );
}
