import { listNotes } from "@/lib/store";
import { Header } from "@/components/ui";
import { PageHeading } from "@/components/WorkspaceUI";
import { NotesBoard } from "@/components/NotesBoard";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const notes = listNotes();


  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Workspace" title="Notes & ideas" description="Capture an idea, agree on the next step, and see what’s being built."/>


        <NotesBoard notes={notes} />
      </main>
    </div>
  );
}
