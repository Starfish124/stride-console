"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecipeCard({
  index,
  id,
  title,
  description,
}: {
  index: string;
  id: string;
  title: string;
  description: string;
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
    <div className="card-lift flex flex-col rounded-card border border-line bg-white p-6">
      <span className="eyebrow text-indigo">{index}</span>
      <h2 className="display mt-3 text-[22px] text-ink">{title}</h2>
      <p className="mt-1 flex-1 text-sm text-slate">{description}</p>
      {error ? <p className="mt-3 text-xs text-indigo-deep">{error}</p> : null}
      <button
        onClick={run}
        disabled={busy}
        className="mt-5 rounded-input bg-indigo px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-deep disabled:opacity-60"
      >
        {busy ? "Running the pipeline." : "Generate draft."}
      </button>
    </div>
  );
}
