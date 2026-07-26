import Link from "next/link";
import { readPulse } from "@/lib/channels/attention";
import type { Urgency } from "@/lib/channels/attention";
import { Ramp } from "@/components/Ramp";
import {
  IconApproved,
  IconEscalate,
  IconGuardrail,
  IconPipeline,
  IconTime,
} from "@/components/icons";

/**
 * Linked Helper, on the front page.
 *
 * The question this answers is not "what are the numbers" but "does this need
 * me". So the machine's state is turned into things waiting on a person,
 * worst first, and the numbers sit underneath as supporting detail rather
 * than as the point.
 */

const URGENCY: Record<Urgency, { icon: typeof IconEscalate; tone: string; ring: string }> = {
  blocked: { icon: IconEscalate, tone: "text-amber", ring: "border-amber/40 bg-amber/[0.06]" },
  waiting: { icon: IconTime, tone: "text-indigo", ring: "border-indigo/25 bg-indigo-tint/50" },
  watch: { icon: IconGuardrail, tone: "text-slate", ring: "border-line bg-white" },
};

export async function LhPulsePanel() {
  const pulse = await readPulse();
  const needsYou = pulse.items.filter((i) => i.urgency !== "watch");

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        <Ramp width={44} className="shrink-0 text-indigo" />
        <div className="min-w-0 flex-1">
          <h2 className="display text-[22px] text-ink">The LinkedIn machine.</h2>
        </div>
        <Link
          href="/campaigns"
          className="eyebrow shrink-0 text-indigo hover:text-indigo-deep"
        >
          Open
        </Link>
      </div>

      {/* Live state, in one line, with a dot that breathes while it runs. */}
      <div className="card-glass mb-3 flex items-center gap-3 rounded-card border border-line bg-white px-5 py-4">
        <span className="relative flex size-2.5 shrink-0">
          {pulse.running > 0 && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-60" />
          )}
          <span
            className={`relative inline-flex size-2.5 rounded-full ${
              !pulse.reachable ? "bg-slate/40" : pulse.running > 0 ? "bg-lime" : "bg-slate/40"
            }`}
          />
        </span>
        <p className="flex-1 text-[15px] leading-snug text-ink">
          {!pulse.reachable
            ? "Out of reach."
            : pulse.running === 0
              ? `${pulse.campaigns} campaign${pulse.campaigns === 1 ? "" : "s"}, none running.`
              : pulse.sending > 0
                ? `${pulse.running} running, ${pulse.sending} able to reach people.`
                : `${pulse.running} running. Research only, nothing can send.`}
        </p>
        <span className="tabular shrink-0 text-[13px] text-slate">
          {pulse.people.toLocaleString("en-GB")} profiles
        </span>
      </div>

      {needsYou.length === 0 ? (
        <p className="card-glass flex items-center gap-2.5 rounded-card border border-line bg-white px-5 py-4 text-[15px] text-ink">
          <IconApproved size={18} className="shrink-0 text-lime" />
          Nothing is waiting on you.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {needsYou.map((item) => {
            const { icon: Icon, tone, ring } = URGENCY[item.urgency];
            const body = (
              <>
                <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug text-ink">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                    {item.detail}
                  </span>
                </span>
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className={`card-lift flex items-start gap-3 rounded-card border px-5 py-4 ${ring}`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={`flex items-start gap-3 rounded-card border px-5 py-4 ${ring}`}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pulse.campaigns > 0 && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-slate">
          <IconPipeline size={15} className="shrink-0 text-mute" />
          {pulse.dailyMax ? `${pulse.dailyMax} actions a day` : "No daily cap set"}
          {pulse.licenceDaysLeft !== null && ` · licence ${pulse.licenceDaysLeft} days`}
        </p>
      )}
    </section>
  );
}
