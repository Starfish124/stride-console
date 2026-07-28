import { listNotes } from "@/lib/store";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { NotesBoard } from "@/components/NotesBoard";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const notes = listNotes();
  const building = notes.filter((n) => n.lane === "doing").length;

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">Team · the board</p>
          <h1 className="title-large mt-3 text-ink">
            Everything either of you <span className="accent">thought of</span>.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            One board, both of you. Ideas on the left, and whatever is being
            built right now in the middle so neither of you starts it twice.
            {building > 0 && ` ${building} in progress.`}
          </p>
        </section>

        <NotesBoard notes={notes} />
      </main>
    </div>
  );
}
