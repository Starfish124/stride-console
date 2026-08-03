"use client";

// Search every client's project files at once. Enter is the gesture.

import { useState } from "react";

interface Hit {
  clientId: string;
  projectId: string;
  clientName: string;
  projectName: string;
  path: string;
  line: number;
  text: string;
}

const CONTEXT = 20;

export function WorkspaceSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ key: string; text: string; from: number; at: number } | null>(
    null,
  );

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setPeek(null);
    const res = await fetch(`/api/workspace/search?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Search failed.");
      setHits(null);
      return;
    }
    setHits(body.hits);
  }

  async function open(hit: Hit) {
    const key = `${hit.projectId}:${hit.path}:${hit.line}`;
    if (peek?.key === key) {
      setPeek(null);
      return;
    }
    const res = await fetch(
      `/api/workspace/projects/${hit.projectId}/files?path=${encodeURIComponent(hit.path)}&preview=1`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const lines = (await res.text()).split("\n");
    const from = Math.max(0, hit.line - 1 - CONTEXT);
    setPeek({
      key,
      text: lines.slice(from, hit.line - 1 + CONTEXT).join("\n"),
      from,
      at: hit.line,
    });
  }

  // Group by client, then project, so results read as places not a flat list.
  const groups = new Map<string, Hit[]>();
  for (const hit of hits ?? []) {
    const key = `${hit.clientName} · ${hit.projectName}`;
    groups.set(key, [...(groups.get(key) ?? []), hit]);
  }

  return (
    <section className="mb-8">
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
          placeholder="Search every client's code"
          className="flex-1 rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-input bg-indigo px-4 py-2 text-sm text-white pressable disabled:bg-mute"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-amber">{error}</p>}
      {hits && hits.length === 0 && <p className="mt-3 text-sm text-mute">Nothing matched.</p>}

      {groups.size > 0 && (
        <div className="mt-4 space-y-4">
          {[...groups.entries()].map(([label, group]) => (
            <div key={label}>
              <p className="eyebrow mb-1 text-slate">{label}</p>
              <ul className="inset-group">
                {group.map((hit) => {
                  const key = `${hit.projectId}:${hit.path}:${hit.line}`;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => open(hit)}
                        className="w-full px-4 py-2 text-left pressable"
                      >
                        <span className="tabular block truncate text-xs text-mute">
                          {hit.path}:{hit.line}
                        </span>
                        <span className="block truncate font-mono text-xs text-ink">{hit.text}</span>
                      </button>
                      {peek?.key === key && (
                        <pre className="max-h-72 overflow-auto border-t border-line bg-paper px-4 py-2 text-xs text-ink">
                          {peek.text.split("\n").map((line, i) => {
                            const number = peek.from + i + 1;
                            return (
                              <div
                                key={number}
                                className={number === peek.at ? "bg-indigo-tint" : undefined}
                              >
                                <span className="tabular mr-3 text-mute">{number}</span>
                                {line}
                              </div>
                            );
                          })}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
