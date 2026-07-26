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
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="py-10">
          <p className="eyebrow text-slate">Library</p>
          <h1 className="display mt-3 text-4xl text-ink">
            Everything you ever made.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Every draft, every post, every number you wrote down. Nothing here
            expires and nothing gets lost.
          </p>
        </section>
        <LibraryBrowser entries={entries} summary={summary} />
      </main>
    </div>
  );
}
