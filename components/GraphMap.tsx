"use client";

// The graph, read rather than drawn. Search a module, see what it leans on,
// what leans on it, and which sessions have been inside it.

import { useEffect, useState } from "react";
import { Glyph } from "@/components/icons";

interface SpineEntry {
  id: string;
  label: string;
  repo: string;
  file: string;
  dependents: number;
}

interface MapData {
  built: boolean;
  nodes: number;
  links: number;
  repos: { repo: string; nodes: number; areas: { name: string; count: number }[] }[];
  spine: SpineEntry[];
  sessions: { id: string; label: string; date: string; touched: { id: string; label: string }[] }[];
}

interface Neighbourhood {
  id: string;
  label: string;
  repo: string;
  file: string;
  dependsOn: { id: string; label: string; repo: string }[];
  dependedOnBy: { id: string; label: string; repo: string }[];
  touchedBy: { id: string; label: string; date: string }[];
}

export function GraphMap() {
  const [data, setData] = useState<MapData | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SpineEntry[] | null>(null);
  const [focus, setFocus] = useState<Neighbourhood | null>(null);

  useEffect(() => {
    let live = true;
    // Fetch-on-mount: the setState happens after an await.
    void fetch("/api/graph/map", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (live) setData(body);
      });
    return () => {
      live = false;
    };
  }, []);

  async function open(id: string) {
    const res = await fetch(`/api/graph/map?node=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (res.ok) setFocus(await res.json());
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const res = await fetch(`/api/graph/map?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    if (res.ok) setHits((await res.json()).hits);
  }

  if (!data) return <p className="text-sm text-mute">Reading the graph…</p>;
  if (!data.built) {
    return <p className="text-sm text-mute">No graph yet. Press rebuild.</p>;
  }

  return (
    <div className="space-y-6">
      <form className="flex items-center gap-2" onSubmit={search}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a file or module"
          className="flex-1 rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="rounded-input bg-indigo px-4 py-2 text-sm text-white pressable disabled:bg-mute"
        >
          Find
        </button>
      </form>

      {hits && (
        <div className="rounded-card border border-line bg-white">
          <p className="eyebrow border-b border-line px-4 py-2 text-slate">
            {hits.length === 0 ? "Nothing by that name" : `${hits.length} found`}
          </p>
          <ul className="divide-y divide-line">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => open(hit.id)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left pressable"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{hit.label}</span>
                  <span className="tabular shrink-0 text-xs text-mute">{hit.repo}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {focus && (
        <div className="rounded-card border border-indigo/40 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{focus.label}</p>
              <p className="tabular truncate text-xs text-mute">
                {focus.repo} · {focus.file}
              </p>
            </div>
            <button
              type="button"
              className="text-mute hover:text-ink"
              onClick={() => setFocus(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
            <div>
              <p className="eyebrow text-slate">
                Leans on {focus.dependsOn.length > 0 && `· ${focus.dependsOn.length}`}
              </p>
              <ul className="mt-1 space-y-1">
                {focus.dependsOn.length === 0 && <li className="text-xs text-mute">Nothing.</li>}
                {focus.dependsOn.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="truncate text-left text-xs text-slate hover:text-indigo"
                      onClick={() => open(n.id)}
                    >
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow text-slate">
                Leaned on by {focus.dependedOnBy.length > 0 && `· ${focus.dependedOnBy.length}`}
              </p>
              <ul className="mt-1 space-y-1">
                {focus.dependedOnBy.length === 0 && (
                  <li className="text-xs text-mute">Nothing yet — it is a leaf.</li>
                )}
                {focus.dependedOnBy.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="truncate text-left text-xs text-slate hover:text-indigo"
                      onClick={() => open(n.id)}
                    >
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {focus.touchedBy.length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <p className="eyebrow text-slate">Sessions that worked in here</p>
              <ul className="mt-1 space-y-1">
                {focus.touchedBy.map((s) => (
                  <li key={s.id} className="text-xs text-slate">
                    <span className="tabular text-mute">{s.date}</span> — {s.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-card border border-line bg-white p-4">
        <p className="eyebrow flex items-center gap-2 text-slate">
          <Glyph name="IconPipeline" size={14} /> What holds everything up
        </p>
        <p className="mt-2 text-xs text-slate">
          The files the most other code leans on. Changing one of these is never a
          small change.
        </p>
        <ul className="inset-group mt-3">
          {data.spine.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => open(entry.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left pressable"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{entry.label}</span>
                  <span className="tabular block truncate text-xs text-mute">
                    {entry.repo} · {entry.file}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm text-slate">{entry.dependents}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-line bg-white p-4">
        <p className="eyebrow flex items-center gap-2 text-slate">
          <Glyph name="IconLayers" size={14} /> The parts
        </p>
        <div className="mt-3 space-y-4">
          {data.repos.map((repo) => (
            <div key={repo.repo}>
              <p className="text-sm text-ink">
                {repo.repo} <span className="tabular text-xs text-mute">· {repo.nodes}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {repo.areas.map((area) => (
                  <span
                    key={area.name}
                    className="tabular rounded-input border border-line px-2 py-0.5 text-xs text-slate"
                  >
                    {area.name} {area.count}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
