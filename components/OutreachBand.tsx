import Link from "next/link";
import { readPulse } from "@/lib/channels/attention";
import { waitingManualSteps, awaitingAnswer, sentLinkedInToday } from "@/lib/salesnav/manual";
import { linkedinDailyCap } from "@/lib/salesnav/config";
import { listClients } from "@/lib/store";
import { IconApproved, IconEscalate, IconTarget, IconTime, IconWorkflow } from "@/components/icons";
import { EngineLight } from "@/components/EngineLight";
import { reach } from "@/lib/salesnav/engine";

/**
 * The outreach band: the first thing on the page, because it is the first
 * thing to do.
 *
 * It is deliberately the ONLY place these items appear. The rule this console
 * keeps is that "what needs a person right now" is one surface or it is none,
 * so the leads panel in the deck gives up the outreach half rather than
 * repeating it two screens further down.
 *
 * A server component, and it has to stay one — it renders above the fold on
 * every visit, and tests/deck.test.mjs holds it to that.
 *
 * Nothing here sends. The buttons are two separate decisions: finding people
 * costs Apollo credits, writing to them costs a founder ten seconds, and
 * merging those into one button would hide whichever you cared about.
 */

/** How long after sending before silence is worth noticing. */
const CHASE_AFTER_DAYS = 7;

export async function OutreachBand() {
  const pulse = await readPulse();
  const items = pulse.items.filter((i) => i.area === "outreach" && i.urgency !== "watch");

  const queue = waitingManualSteps();
  const chase = awaitingAnswer(CHASE_AFTER_DAYS);
  const sentToday = sentLinkedInToday(new Date());
  const cap = linkedinDailyCap();
  const byId = new Map(listClients().map((c) => [c.id, c]));
  const who = (clientId: string) => {
    const c = byId.get(clientId);
    return c ? `${c.company} · ${c.name}` : clientId;
  };

  // A hard stop is not one item among several: while it is on, tick() returns
  // before it reaches the LinkedIn branch, so nothing queues at all and every
  // other line here would be describing a machine that is not running.
  const stopped = items.find((i) => i.id === "salesnav-stopped");
  const nothingYet = queue.length === 0 && chase.length === 0 && items.length === 0;
  const done = reach();

  return (
    <section className="mb-7">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-3">
          <p className="eyebrow text-slate">Outreach</p>
          <EngineLight />
        </div>
        <Link href="/outreach" className="eyebrow text-indigo hover:text-indigo-deep">
          Open
        </Link>
      </div>

      <div className="card-glass rounded-card border border-line bg-white p-5">
        <p className="display text-[19px] leading-snug text-ink">
          {stopped
            ? "The engine is stopped. Nothing queues while it is."
            : queue.length > 0
            ? `${queue.length} message${queue.length === 1 ? "" : "s"} written and waiting on you.`
              : nothingYet
                ? "Nothing waiting. The engine has not been started."
                : "Nothing to send right now."}
        </p>

        <p className="mt-1.5 text-[13px] text-slate">
          {stopped ? (
            <>
              {stopped.detail} Clear it on{" "}
              <Link href="/salesnav" className="text-indigo underline underline-offset-2">
                the brake
              </Link>
              .
            </>
          ) : (
            <>
              {sentToday} of {cap} sent today
              {chase.length > 0
                ? ` · ${chase.length} with no answer after ${CHASE_AFTER_DAYS} days`
                : ""}
            </>
          )}
        </p>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          {[
            { label: "Sent", value: done.sent },
            { label: "In a sequence", value: done.active },
            { label: "Replied", value: done.replied },
            { label: "Skipped", value: done.skipped },
          ].map((f) => (
            <div key={f.label}>
              <dd className="figure text-[17px] text-ink">{f.value}</dd>
              <dt className="eyebrow mt-0.5 text-slate">{f.label}</dt>
            </div>
          ))}
        </dl>

        {/* The two stages, never one button: find people, then write to them. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/leads"
            className="pressable inline-flex items-center gap-2 rounded-input border border-line px-4 py-2 text-[14px] text-ink"
          >
            <IconTarget size={16} className="text-indigo" />
            Refine the leads
          </Link>
          <Link
            href="/outreach#queue"
            className="pressable inline-flex items-center gap-2 rounded-input bg-ink px-4 py-2 text-[14px] font-semibold text-white"
          >
            <IconWorkflow size={16} />
            {queue.length > 0 ? "Send what is waiting" : "Write to them"}
          </Link>
        </div>

        {items.filter((i) => i.id !== "salesnav-stopped").length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            {items.filter((i) => i.id !== "salesnav-stopped").map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href ?? "/outreach"}
                  className={`card-lift flex items-start gap-2.5 rounded-card border px-4 py-3 ${
                    item.urgency === "blocked"
                      ? "border-amber/40 bg-amber/[0.06]"
                      : "border-indigo/25 bg-indigo-tint/50"
                  }`}
                >
                  {item.urgency === "blocked" ? (
                    <IconEscalate size={16} className="mt-0.5 shrink-0 text-amber" />
                  ) : (
                    <IconTime size={16} className="mt-0.5 shrink-0 text-indigo" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-snug text-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate">
                      {item.detail}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Who is actually next, by name. A count is a number; a name is a job. */}
        {queue.length > 0 ? (
          <ul className="mt-4 flex flex-col border-t border-line pt-1">
            {queue.slice(0, 3).map((step) => (
              <li
                key={step.key}
                className="flex min-h-[36px] items-center gap-3 py-1.5 text-[13px]"
              >
                <IconApproved size={14} className="shrink-0 text-slate" />
                <span className="min-w-0 flex-1 truncate text-ink">{who(step.clientId)}</span>
                <span className="eyebrow shrink-0 text-slate">{step.kind}</span>
              </li>
            ))}
            {queue.length > 3 ? (
              <li className="pt-1 text-[12px] text-slate">and {queue.length - 3} more</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
