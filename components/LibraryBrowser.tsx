"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RECIPE_LABELS } from "@/lib/types";
import type { DraftStatus } from "@/lib/types";
import {
  matchesFilters,
  matchesQuery,
  monthLabel,
  type LibraryEntry,
  type LibrarySummary,
  type RecipeFilter,
} from "@/lib/library";
import { StatusBadge } from "@/components/ui";

const RECIPE_CHIPS: { value: RecipeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tldr", label: "TLDR" },
  { value: "news", label: "News" },
  { value: "myth", label: "Myth" },
  { value: "events", label: "Events" },
];

const STATUS_CHIPS: { value: DraftStatus | "all"; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "posted", label: "Posted" },
];

function formatCount(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US");
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-glass rounded-card border border-line bg-white p-4">
      <p className="eyebrow text-slate">{label}</p>
      <p className="display tabular mt-1 text-2xl text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate">{hint}</p> : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`eyebrow rounded-full border px-3 py-1.5 transition-colors ${
        active
          ? "border-indigo bg-indigo text-white"
          : "border-line bg-white text-slate hover:border-indigo hover:text-indigo"
      }`}
    >
      {children}
    </button>
  );
}

export function LibraryBrowser({
  entries,
  summary,
}: {
  entries: LibraryEntry[];
  summary: LibrarySummary;
}) {
  const [query, setQuery] = useState("");
  const [recipe, setRecipe] = useState<RecipeFilter>("all");
  const [status, setStatus] = useState<DraftStatus | "all">("all");

  const shelves = useMemo(() => {
    const visible = entries.filter(
      (e) => matchesFilters(e, recipe, status) && matchesQuery(e, query),
    );
    const groups: { month: string; items: LibraryEntry[] }[] = [];
    for (const entry of visible) {
      const month = monthLabel(entry.draft.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.month === month) last.items.push(entry);
      else groups.push({ month, items: [entry] });
    }
    return groups;
  }, [entries, query, recipe, status]);

  const shown = shelves.reduce((n, g) => n + g.items.length, 0);

  return (
    <div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Posts made" value={formatCount(summary.total)} />
        <Tile label="Posted" value={formatCount(summary.posted)} />
        <Tile
          label="Impressions"
          value={formatCount(summary.impressions)}
          hint={summary.impressions === 0 ? "Record stats on posted drafts." : undefined}
        />
        <Tile
          label="Best post"
          value={
            summary.bestImpressions !== undefined
              ? formatCount(summary.bestImpressions)
              : "—"
          }
          hint={summary.bestImpressions !== undefined ? "impressions" : "No stats yet."}
        />
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every post you ever wrote."
          className="w-full rounded-input border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-slate focus:border-indigo"
        />
        <div className="flex flex-wrap items-center gap-2">
          {RECIPE_CHIPS.map((c) => (
            <Chip key={c.value} active={recipe === c.value} onClick={() => setRecipe(c.value)}>
              {c.label}
            </Chip>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
          {STATUS_CHIPS.map((c) => (
            <Chip key={c.value} active={status === c.value} onClick={() => setStatus(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="eyebrow text-slate">
          {shown} of {entries.length} shown
        </p>
      </section>

      {shelves.length === 0 ? (
        <p className="mt-6 card-glass rounded-card border border-line bg-white p-8 text-sm text-slate">
          {entries.length === 0
            ? "Nothing in the library yet. Run a recipe on the console and it lands here forever."
            : "No posts match that. Loosen the filters or clear the search."}
        </p>
      ) : (
        shelves.map((shelf) => (
          <section key={shelf.month} className="mt-8">
            <h2 className="eyebrow text-slate">{shelf.month}</h2>
            <ul className="mt-3 overflow-hidden card-glass rounded-card border border-line bg-white">
              {shelf.items.map((entry, i) => {
                const { draft } = entry;
                const preview =
                  draft.variants.page || draft.imageHeadline || RECIPE_LABELS[draft.recipe];
                return (
                  <li key={draft.id} className={i > 0 ? "border-t border-line" : ""}>
                    <Link
                      href={`/drafts/${draft.id}`}
                      className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-paper"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {RECIPE_LABELS[draft.recipe]}
                          </span>
                          {summary.bestDraftId === draft.id ? (
                            <span className="eyebrow rounded-full bg-indigo-tint px-2 py-0.5 text-indigo">
                              Best
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate">{preview}</p>
                        <p className="mt-1.5 text-xs text-slate">
                          {new Date(draft.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {entry.postings.length > 0
                            ? ` · went out ${entry.postings.length}×`
                            : ""}
                          {entry.impressions !== undefined
                            ? ` · ${formatCount(entry.impressions)} impressions`
                            : ""}
                          {entry.reactions !== undefined
                            ? ` · ${formatCount(entry.reactions)} reactions`
                            : ""}
                        </p>
                      </div>
                      <StatusBadge status={draft.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
