import { notFound } from "next/navigation";
import { getDraft, listPostLog } from "@/lib/store";
import { Header } from "@/components/ui";
import { DraftEditor } from "@/components/DraftEditor";

export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = getDraft(id);
  if (!draft) notFound();
  const postLog = listPostLog().filter((e) => e.draftId === id);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <DraftEditor initial={draft} postLog={postLog} />
      </main>
    </div>
  );
}
