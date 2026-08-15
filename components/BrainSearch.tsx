"use client";

// Search the brain. Enter is the gesture, same as the workspace search.

import { useState } from "react";

interface Memory {
  id: string;
  kind: "session" | "run" | "event";
  subject: string;
  body: string;
  createdAt: string;
}

const KIND_LABELS: Record<Memory["kind"], string> = {
  session: "session",
  run: "delivery run",
  event: "timeline",
};

export function BrainSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Memory[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/brain/search?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ memories: [] }));
    setBusy(false);
    setHits(res.ok ? body.memories : []);
  }

  return (
    <section className="mt-8">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the memory — a client, a system, a lesson"
          className="flex-1 rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-input bg-indigo px-4 py-2 text-sm text-white pressable disabled:bg-mute"
        >
          {busy ? "Recalling…" : "Recall"}
        </button>
      </form>

      {hits && hits.length === 0 && (
        <p className="mt-3 text-sm text-mute">Nothing remembered about that yet.</p>
      )}
      {hits && hits.length > 0 && (
        <div className="mt-4 inset-group">
          {hits.map((m) => (
            <div key={m.id} className="px-4 py-2.5">
              <p className="text-[14px] font-semibold text-ink">{m.subject}</p>
              {m.body !== m.subject ? (
                <p className="mt-0.5 text-[13px] text-slate">{m.body}</p>
              ) : null}
              <p className="mt-0.5 text-[12px] text-mute">
                {KIND_LABELS[m.kind] ?? m.kind} · {m.createdAt.slice(0, 10)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
