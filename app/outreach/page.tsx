import { Header } from "@/components/ui";
import { SequenceEditor } from "@/components/SequenceEditor";
import { listSequences } from "@/lib/outreach/sequence";
import { listReplies } from "@/lib/outreach/replies";
import { AiDraftQueue } from "@/components/AiDraftQueue";
import { PageHeading } from "@/components/WorkspaceUI";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  // The editor cannot render an email step yet, and handing it one would drop
  // the step on the next save. So it is given the newest sequence it can hold
  // whole, and email sequences are edited from the sequencer page instead.
  const existing = listSequences().find((s) => !s.steps.some((step) => step.kind === "email"));
  const replies = listReplies();
  const unhandled = replies.filter((r) => !r.handled);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Growth" title="Outreach" description="Keep conversations moving with clear sequences, reviewed drafts, and timely replies."/>


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
                  steps: existing.steps.filter(
                    (step): step is typeof step & { kind: "connect" | "message" | "inmail" } =>
                      step.kind !== "email",
                  ),
                }
              : undefined
          }
        />
      </main>
    </div>
  );
}
