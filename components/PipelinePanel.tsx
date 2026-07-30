import Link from "next/link";
import type { Client } from "@/lib/types";
import { pipelineStages } from "@/lib/dashboard";
import { Panel } from "@/components/Panel";

/**
 * The book, by stage.
 *
 * The bar is drawn from the same counts as the rows beneath it and carries no
 * number of its own, so it is hidden from screen readers: the rows are the
 * accessible version, and reading both would say everything twice.
 */

const FILL: Record<string, string> = {
  lead: "bg-indigo/35",
  talking: "bg-indigo/60",
  proposal: "bg-indigo",
  client: "bg-ink",
};

export function PipelinePanel({ clients }: { clients: Client[] }) {
  const stages = pipelineStages(clients);
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <Panel icon="IconTeam" title="The book." href="/clients" linkLabel="Clients">
      {total === 0 ? (
        <p className="text-[13px] text-slate">Nobody in the book yet.</p>
      ) : (
        <>
          <div aria-hidden className="flex h-2 gap-px overflow-hidden rounded-full">
            {stages
              .filter((s) => s.count > 0)
              .map((s) => (
                <span key={s.stage} className={FILL[s.stage]} style={{ flexGrow: s.count }} />
              ))}
          </div>

          <ul className="inset-group mt-3">
            {stages.map((s) => (
              <li key={s.stage}>
                <Link
                  href="/clients"
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-paper"
                >
                  <span aria-hidden className={`size-1.5 shrink-0 ${FILL[s.stage]}`} />
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-[1.35] text-ink">
                    {s.label}
                  </span>
                  <span className="num shrink-0 text-[13px] text-slate">{s.count}</span>
                  <span className="num w-16 shrink-0 text-right text-[13px] text-ink">
                    {s.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
