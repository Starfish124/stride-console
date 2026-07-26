import { channelHealth } from "@/lib/channels";
import type { ChannelState } from "@/lib/channels";

const DOT: Record<ChannelState, string> = {
  ready: "bg-emerald-500",
  degraded: "bg-amber-500",
  error: "bg-red-500",
  off: "bg-slate/40",
};

const WORD: Record<ChannelState, string> = {
  ready: "Ready",
  degraded: "Needs attention",
  error: "Broken",
  off: "Off",
};

/**
 * The ways out to LinkedIn, and whether they work. Rendered on the server so
 * the bridge token never leaves the Mac.
 */
export async function ChannelHealth() {
  const channels = await channelHealth();

  return (
    <section className="mb-10 card-glass rounded-card border border-line bg-white p-6">
      <p className="eyebrow text-slate">Channels</p>
      <p className="mt-2 text-sm text-slate">
        How posts and campaigns actually reach LinkedIn.
      </p>

      <ul className="mt-4 flex flex-col gap-5">
        {channels.map((channel) => (
          <li key={channel.id}>
            <div className="flex items-baseline gap-2.5">
              <span
                aria-hidden
                className={`inline-block size-2 shrink-0 translate-y-[-1px] rounded-full ${DOT[channel.state]}`}
              />
              <span className="text-sm font-medium text-ink">{channel.label}</span>
              <span className="eyebrow text-slate">{WORD[channel.state]}</span>
            </div>

            <p className="mt-1.5 pl-[18px] text-sm text-slate">{channel.detail}</p>

            {channel.facts && channel.facts.length > 0 && (
              <dl className="mt-3 flex flex-col gap-1 pl-[18px]">
                {channel.facts.map((fact, i) => (
                  <div key={i} className="flex gap-2 text-[13px]">
                    <dt className="text-slate">{fact.label}</dt>
                    <dd className={fact.warn ? "tabular font-medium text-amber-700" : "tabular text-ink"}>
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
