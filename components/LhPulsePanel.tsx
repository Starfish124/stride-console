import Link from "next/link";
import { readPulse } from "@/lib/channels/attention";
import type { Urgency } from "@/lib/channels/attention";
import { compact } from "@/lib/dashboard";
import { Panel, PanelFigure } from "@/components/Panel";
import { IconApproved, IconEscalate, IconGuardrail, IconTime } from "@/components/icons";

/**
 * Linked Helper, on the front page.
 *
 * The question this answers is not "what are the numbers" but "does this need
 * me". So the machine's state is turned into things waiting on a person,
 * worst first, and the numbers sit underneath as supporting detail rather
 * than as the point.
 *
 * A figure nobody has set prints an em dash. No daily cap and a cap of zero
 * are opposite facts and must not share a face.
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
    <Panel
      icon="IconPipeline"
      title="The LinkedIn machine."
      href="/campaigns"
      linkLabel="Open"
    >
      {/* Live state, in one line, with a dot that breathes while it runs. */}
      <div className="mb-2.5 flex items-center gap-3 px-1">
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
      </div>

      {needsYou.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-card border border-line bg-white px-4 py-3 text-[13px] text-ink">
          <IconApproved size={16} className="shrink-0 text-lime" />
          Nothing is waiting on you.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {needsYou.map((item) => {
            const { icon: Icon, tone, ring } = URGENCY[item.urgency];
            const body = (
              <>
                <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-ink">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate">
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
                    className={`card-lift flex items-start gap-2.5 rounded-card border px-4 py-3 ${ring}`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={`flex items-start gap-2.5 rounded-card border px-4 py-3 ${ring}`}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex border-t border-line px-1 pt-3">
        <PanelFigure
          label="Profiles"
          value={pulse.reachable ? compact(pulse.people) : "—"}
        />
        <PanelFigure label="A day" value={pulse.dailyMax ? String(pulse.dailyMax) : "—"} />
        <PanelFigure
          label="Licence days"
          value={pulse.licenceDaysLeft === null ? "—" : String(pulse.licenceDaysLeft)}
        />
      </div>
    </Panel>
  );
}
