"use client";

// Rebuild the graph, and say plainly when it last happened.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GraphBuild({ built }: { built?: { at: string; nodes: number; edges: number; bodies: number } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/graph/build", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "The build failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={build}
        disabled={busy}
        className="rounded-input bg-indigo px-4 py-2 text-sm text-white pressable disabled:bg-mute"
      >
        {busy ? "Building…" : "Rebuild the graph"}
      </button>
      {built ? (
        <p className="text-sm text-slate">
          <span className="tabular">{built.nodes.toLocaleString()}</span> nodes and{" "}
          <span className="tabular">{built.edges.toLocaleString()}</span> links across{" "}
          {built.bodies} {built.bodies === 1 ? "body" : "bodies"} of work · built{" "}
          {built.at.slice(0, 16).replace("T", " ")}
        </p>
      ) : (
        <p className="text-sm text-mute">Never built on this machine.</p>
      )}
      {error && <p className="w-full text-sm text-amber">{error}</p>}
    </div>
  );
}
