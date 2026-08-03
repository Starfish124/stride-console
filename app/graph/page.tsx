import fs from "node:fs";
import path from "node:path";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { GraphBuild } from "@/components/GraphBuild";
import { GraphDevices } from "@/components/GraphDevices";
import { GraphViews } from "@/components/GraphViews";
import { GRAPH_DIR, listSessionNotes } from "@/lib/graph/store";

export const dynamic = "force-dynamic";

interface Built {
  at: string;
  nodes: number;
  edges: number;
  bodies: number;
}

function lastBuild(): Built | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(GRAPH_DIR, "out", "built.json"), "utf8"),
    ) as Built;
  } catch {
    return undefined;
  }
}

export default function GraphPage() {
  const built = lastBuild();
  const notes = listSessionNotes();
  const hasGraph = fs.existsSync(path.join(GRAPH_DIR, "out", "graph.html"));

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-7xl px-6 pb-20">
        {/* The drawing is the point of this page, so the words above it are
            kept to what a first-time viewer needs and no more. Anything taller
            pushes the graph under the fold, which is where it was. */}
        <section className="pb-5 pt-6">
          <Ramp width={52} className="mb-3 text-indigo" />
          <p className="eyebrow text-slate">Delivery</p>
          <h1 className="display mt-2 text-3xl text-ink sm:text-4xl">The graph</h1>
          {/* Desktop only. On a phone this is three lines that push the drawing
              under the tab bar, and the caption beneath the graph already says
              how to read it — which is the part that actually helps. */}
          <p className="mt-2 hidden max-w-xl text-sm text-slate sm:block">
            Every Stride codebase and every session that worked on one, in a single
            map. Code is read locally with tree-sitter, so building it calls nothing
            and costs nothing.
          </p>
        </section>

        <section className="mb-5">
          <GraphBuild built={built} />
        </section>

        <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start xl:gap-6 xl:space-y-0">
          <div className="space-y-4">
            <GraphViews hasDrawing={hasGraph} />
          </div>

          <aside className="space-y-6">
            <GraphDevices />
            <div className="rounded-card border border-line bg-white p-4">
              <p className="eyebrow text-slate">Sessions registered</p>
              {notes.length === 0 ? (
                <p className="mt-2 text-sm text-mute">
                  None yet. Sessions in a Stride folder register themselves once a
                  machine is connected; say &quot;stride context&quot; in any other
                  session to include it.
                </p>
              ) : (
                <>
                  <p className="tabular mt-2 text-sm text-slate">{notes.length} in the graph</p>
                  <ul className="inset-group mt-3">
                    {notes.slice(0, 10).map((note) => (
                      <li key={note.name} className="px-4 py-2">
                        <span className="block truncate text-sm text-ink">{note.title}</span>
                        <span className="tabular block text-xs text-mute">
                          {note.date || note.at.slice(0, 10)}
                          {note.project && ` · ${note.project}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
