import { PageHeading } from "@/components/WorkspaceUI";
import { listDrafts, listPostLog } from "@/lib/store";
import { buildLibrary, librarySummary } from "@/lib/library";
import { Header } from "@/components/ui";
import { LibraryBrowser } from "@/components/LibraryBrowser";


export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const entries = buildLibrary(listDrafts(), listPostLog());
  const summary = librarySummary(entries);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Growth" title="Content library" description="From the first draft to the published post. All your content, together."/>

        <LibraryBrowser entries={entries} summary={summary} />
      </main>
    </div>
  );
}
