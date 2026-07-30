import Link from "next/link";
import type { CalendarEntry } from "@/lib/calendar";
import { Panel } from "@/components/Panel";

/**
 * What is owed to people, soonest first, late at the top.
 *
 * A server component, so the dates are formatted once on the server and there
 * is no clock to disagree about during hydration.
 */
export function CalendarPanel({
  entries,
  today,
}: {
  entries: CalendarEntry[];
  today: string;
}) {
  return (
    <Panel icon="IconTime" title="Next with people." href="/calendar" linkLabel="Calendar">
      {entries.length === 0 ? (
        <p className="text-[13px] text-slate">Nothing is booked.</p>
      ) : (
        <ul className="inset-group">
          {entries.map((e) => {
            const late = e.date < today;
            return (
              <li key={e.id}>
                <Link
                  href={e.href ?? "/calendar"}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper"
                >
                  <span
                    className={`eyebrow w-12 shrink-0 ${late ? "text-amber" : "text-slate"}`}
                  >
                    {late
                      ? "Late"
                      : new Date(`${e.date}T00:00:00Z`).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-[1.35] text-ink">
                    {e.title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
