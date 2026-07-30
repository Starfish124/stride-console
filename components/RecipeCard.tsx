"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Glyph } from "@/components/icons";
import { Working } from "@/components/Loader";

/** One glyph per recipe, named rather than imported, so the lookup can happen
 *  in the render without declaring a component type on the way. */
const GLYPH: Record<string, string> = {
  tldr: "IconLayers",
  news: "IconBolt",
  myth: "IconSpark",
};

export function RecipeCard({
  index,
  id,
  title,
}: {
  index: string;
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/run/${id}`, { method: "POST" });
      const data = (await res.json()) as { id?: string; error?: string };
      if (res.ok && data.id) {
        router.push(`/drafts/${data.id}`);
      } else {
        setError(data.error ?? "The run failed.");
        setBusy(false);
      }
    } catch {
      setError("The run failed.");
      setBusy(false);
    }
  }

  return (
    <div className="card-lift flex flex-col card-glass rounded-card border border-line bg-white p-4">
      <span className="flex items-center gap-2.5">
        <Glyph name={GLYPH[id] ?? "IconSpark"} size={18} className="text-indigo" />
        <span className="eyebrow text-slate">{index}</span>
      </span>
      <h2 className="display mt-2.5 flex-1 text-[17px] text-ink">{title}</h2>
      {error ? <p className="mt-2 text-[11px] text-indigo-deep">{error}</p> : null}
      <button
        onClick={run}
        disabled={busy}
        className="mt-3 rounded-input bg-indigo px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-deep disabled:opacity-60"
      >
        {busy ? <Working onDark>Running the pipeline.</Working> : "Generate draft."}
      </button>
    </div>
  );
}
