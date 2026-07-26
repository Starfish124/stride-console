"use client";

import { useEffect, useState } from "react";
import type { SourceEntry } from "@/lib/types";

export function SourcesEditor() {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState({ name: "", url: "", kind: "rss", tier: "2" });

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((data: SourceEntry[]) => {
        setSources(data);
        setLoaded(true);
      });
  }, []);

  async function persist(next: SourceEntry[]) {
    setSources(next);
    const res = await fetch("/api/sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      setSources((await res.json()) as SourceEntry[]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.url.trim()) return;
    const entry: SourceEntry = {
      id: `src_${Date.now().toString(36)}`,
      name: draft.name.trim() || draft.url.trim(),
      url: draft.url.trim(),
      kind: draft.kind === "page" ? "page" : "rss",
      tier: Number(draft.tier) as 1 | 2 | 3,
    };
    persist([...sources, entry]);
    setDraft({ name: "", url: "", kind: "rss", tier: "2" });
  }

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="display text-[22px] text-ink">The source list.</h2>
        <span className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={async () => {
              const res = await fetch("/api/sources/defaults", { method: "POST" });
              if (res.ok) {
                setSources((await res.json()) as SourceEntry[]);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }
            }}
            className="text-sm font-semibold text-indigo hover:text-indigo-deep"
          >
            Add the new defaults.
          </button>
          <span className="eyebrow text-slate">{saved ? "Saved." : `${sources.length} sources`}</span>
        </span>
      </div>

      {!loaded ? (
        <p className="card-glass rounded-card border border-line bg-white p-5 text-sm text-slate">
          Loading the sources.
        </p>
      ) : (
        <ul className="overflow-hidden card-glass rounded-card border border-line bg-white">
          {sources.map((s, i) => (
            <li
              key={s.id}
              className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <span className="eyebrow w-7 text-indigo">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {s.name}
                </span>
                <span className="block truncate text-xs text-slate">{s.url}</span>
              </span>
              <span className="eyebrow text-slate">
                {s.kind} — T{s.tier}
              </span>
              <button
                onClick={() => persist(sources.filter((x) => x.id !== s.id))}
                className="rounded-input border border-line px-2.5 py-1 text-xs font-semibold text-slate hover:border-ink hover:text-ink"
              >
                Remove.
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={add}
        className="mt-4 grid gap-2 card-glass rounded-card border border-line bg-white p-5 sm:grid-cols-[1fr_1.6fr_auto_auto_auto]"
      >
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name"
          className="rounded-input border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-indigo"
        />
        <input
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          placeholder="https://feed-or-page-url"
          className="rounded-input border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-indigo"
        />
        <select
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          className="rounded-input border border-line bg-paper px-2 py-2 text-sm outline-none"
        >
          <option value="rss">RSS</option>
          <option value="page">Page</option>
        </select>
        <select
          value={draft.tier}
          onChange={(e) => setDraft({ ...draft, tier: e.target.value })}
          className="rounded-input border border-line bg-paper px-2 py-2 text-sm outline-none"
        >
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
        <button
          type="submit"
          className="rounded-input bg-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-deep"
        >
          Add source.
        </button>
      </form>
    </section>
  );
}
