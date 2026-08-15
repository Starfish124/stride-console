import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui";
import { BUILD_REPOS } from "@/lib/build/repos";
import BuildTerminal from "@/components/BuildTerminal";

export const dynamic = "force-dynamic";

export default async function BuildTermPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; preset?: string; mode?: string }>;
}) {
  const { repo: repoKey, preset = "claude", mode } = await searchParams;
  const repo = BUILD_REPOS.find((r) => r.key === repoKey);
  if (!repo) notFound();

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-3 pb-2 sm:px-6">
        <div className="flex items-baseline gap-3 py-2">
          <Link href="/build" className="eyebrow text-slate">
            ← Build
          </Link>
          <span className="font-medium text-ink">{repo.name}</span>
          <span className="text-sm text-slate">
            {preset === "shell" ? "shell" : mode === "new" ? "Claude · fresh" : "Claude"}
          </span>
        </div>
        <BuildTerminal cwd={repo.dir} preset={preset} mode={mode} />
      </main>
    </div>
  );
}
