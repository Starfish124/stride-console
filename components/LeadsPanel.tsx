import Link from "next/link";
import { readPulse } from "@/lib/channels/attention";
import type { Urgency } from "@/lib/channels/attention";
import { compact } from "@/lib/dashboard";
import { Panel, PanelFigure } from "@/components/Panel";
import { IconApproved, IconEscalate, IconGuardrail, IconTime } from "@/components/icons";

/**
 * Lead generation, on the front page.
 *
 * The question this answers is not "what are the numbers" but "does this need
 * me". So the state is turned into things waiting on a person, worst first,
 * and the numbers sit underneath as supporting detail rather than as the point.
 *
 * Replaces the Linked Helper panel. The old one led with a running/stopped dot
 * because a machine was sending on its own; nothing sends on its own any more,
 * so the lead is what a founder has to pick up.
 *
 * The queue, the caps and the replies are NOT here. They are the outreach band
 * at the top of the front page, and showing them twice on one screen is the
 * thing lib/channels/attention.ts says must not happen.
 */

const URGENCY: Record<Urgency, { icon: typeof IconEscalate; tone: string; ring: string }> = {
  blocked: { icon: IconEscalate, tone: "text-amber", ring: "border-amber/40 bg-amber/[0.06]" },
  waiting: { icon: IconTime, tone: "text-indigo", ring: "border-indigo/25 bg-indigo-tint/50" },
  watch: { icon: IconGuardrail, tone: "text-slate", ring: "border-line bg-white" },
};

export async function LeadsPanel() {
  const pulse = await readPulse();
  // Only the lead-book half. The outreach items live in the band at the top of
  // the front page now: one surface for "what needs a person", not two.
  const needsYou = pulse.items.filter((i) => i.urgency !== "watch" && i.area !== "outreach");

  return (
    <Panel icon="IconTarget" title="Lead generation." href="/leads" linkLabel="Open">
      <div className="mb-2.5 flex items-center gap-3 px-1">
        <span className="relative flex size-2.5 shrink-0">
          <span
            className={`relative inline-flex size-2.5 rounded-full ${
              pulse.leads > 0 ? "bg-lime" : "bg-slate/40"
            }`}
          />
        </span>
        <p className="flex-1 text-[15px] leading-snug text-ink">
          {pulse.leads === 0
            ? "Nobody in the book yet."
            : `${compact(pulse.leads)} in the book, ${compact(pulse.contactable)} with an email.`}
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
        <PanelFigure label="In the book" value={compact(pulse.leads)} />
        <PanelFigure label="With email" value={compact(pulse.contactable)} />
        <PanelFigure label="Matching" value={pulse.pool ? compact(pulse.pool) : "—"} />
      </div>
    </Panel>
  );
}
