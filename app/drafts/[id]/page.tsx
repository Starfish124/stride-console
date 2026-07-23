import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDraft, listPostLog } from "@/lib/store";
import { FOUNDER_COOKIE } from "@/lib/auth";
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
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <DraftEditor initial={draft} postLog={postLog} />
      </main>
    </div>
  );
}
