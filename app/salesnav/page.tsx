import Link from "next/link";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { SalesNavControls } from "@/components/SalesNavControls";
import { salesnavStatus } from "@/lib/salesnav/channel";
import { listEnrolments } from "@/lib/salesnav/store";
import { listClients } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The email sequencer, and the one screen that can stop it.
 *
 * Seven attention items on the front page point here, and the docs name this
 * page as the first way to stop cold email. It has to exist and it has to lead
 * with the state and the brake, not with an explanation.
 */
export default async function SalesNavPage() {
  const status = salesnavStatus();
  const enrolments = listEnrolments();
  const byId = new Map(listClients().map((c) => [c.id, c]));

  const live = status.mode === "live";
  const stopped = Boolean(status.stop);

  const facts: { label: string; value: string; note?: string }[] = [
    {
      label: "Sent today",
      value: `${status.sentToday} of ${status.dailyCap}`,
      note: `${status.domainCap} per company`,
    },
    { label: "In a sequence", value: String(status.active), note: `${status.paused} paused` },
    { label: "Suppressed", value: String(status.suppressed), note: "never contacted again" },
    {
      label: "Last run",
      value: status.lastTickAt ? new Date(status.lastTickAt).toLocaleTimeString("en-GB") : "—",
      note: status.lastTickAt ? status.window : "the runner has not ticked",
    },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-12">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Email sequencer</p>
          <h1 className="display mt-3 text-3xl text-ink">
            {stopped
              ? "Stopped."
              : live
                ? "Sending, for real."
                : "Writing, sending nothing."}
          </h1>
          <p className="mt-3 text-[15px] text-slate">
            {stopped
              ? `Stopped by ${status.stop?.by}. ${status.stop?.reason ?? "Nothing goes out until somebody starts it again."}`
              : live
                ? "Every step that comes due goes to a real inbox. The switch below stops all of it at once."
                : "Every step is written, checked and recorded, and nothing leaves the building. This is what a fresh checkout does, and what it keeps doing until it is configured otherwise."}
          </p>
        </section>

        <section className="card-glass mb-8 rounded-card border border-line bg-white p-5">
          <SalesNavControls stopped={stopped} />
        </section>

        <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="card-raised rounded-card border border-line bg-white px-4 py-3.5">
              <dt className="eyebrow text-slate">{f.label}</dt>
              <dd className="figure mt-1.5 text-[22px] text-ink">{f.value}</dd>
              {f.note ? <p className="mt-1 text-[12px] leading-snug text-slate">{f.note}</p> : null}
            </div>
          ))}
        </dl>

        {/* Whatever is standing between this and a real send, in the order it
            has to be fixed. A blocker list is more use than a green tick. */}
        {status.blockers.length > 0 && (
          <section className="mb-8 rounded-card border border-line bg-white p-5">
            <p className="eyebrow text-slate">Before it can send</p>
            <ul className="mt-3 flex flex-col gap-2">
              {status.blockers.map((b) => (
                <li key={b} className="font-mono text-[13px] text-ink">
                  {b}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-8 rounded-card border border-line bg-white p-5">
          <p className="eyebrow text-slate">Replies</p>
          <p className="mt-2 text-[15px] text-ink">{status.replyDetection}</p>
          {status.replyDetection === "manual" && live ? (
            <p className="mt-2 text-[13px] text-amber">
              Nothing reads the mailbox, so a person answering does not stop
              their sequence by itself. Move them along in the pipeline and it
              stops.
            </p>
          ) : null}
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="display text-[22px] text-ink">Who is in one.</h2>
            {status.stuck > 0 ? (
              <p className="text-[13px] text-amber">{status.stuck} need a person</p>
            ) : null}
          </div>

          {enrolments.length === 0 ? (
            <p className="text-[15px] text-slate">
              Nobody is enrolled. A sequence starts from a client in{" "}
              <Link href="/clients" className="accent">
                the book
              </Link>
              , because the lawful basis for writing to somebody has to be
              recorded before the first message, not after it.
            </p>
          ) : (
            <ul className="inset-group">
              {enrolments.map((e) => {
                const client = byId.get(e.clientId);
                return (
                  <li key={e.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-ink">
                        {client ? `${client.company} · ${client.name}` : e.email}
                      </span>
                      <span className="block text-[12px] text-slate">
                        step {e.stepIndex + 1}
                        {e.stoppedReason ? ` · ${e.stoppedReason}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-slate">{e.state}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
