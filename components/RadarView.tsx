"use client";

import { useCallback, useEffect, useState } from "react";
import type { SourceReportEntry, SourcedItem } from "@/lib/types";

interface RadarData {
  items: SourcedItem[];
  report: SourceReportEntry[];
  at: string;
}

function age(publishedAt?: string): string {
  if (!publishedAt) return "";
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return "";
  const hours = Math.max(0, Math.round((Date.now() - t) / 3600000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="eyebrow text-slate">{label}</p>
      <p className="display mt-1 text-2xl text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate">{hint}</p> : null}
    </div>
  );
}

export function RadarView() {
  const [data, setData] = useState<RadarData | null>(null);
  // True from the start: the first sweep begins the moment the page mounts.
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSweep = useCallback(async () => {
    try {
      const res = await fetch("/api/radar");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as RadarData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  const scan = useCallback(() => {
    setScanning(true);
    setError(null);
    void fetchSweep();
  }, [fetchSweep]);

  useEffect(() => {
    // Fetch-on-mount: every setState in fetchSweep happens after an await,
    // never synchronously during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSweep();
  }, [fetchSweep]);

  const okSources = data?.report.filter((r) => r.ok) ?? [];
  const downSources = data?.report.filter((r) => !r.ok) ?? [];
  const pulled = data?.report.reduce((n, r) => n + r.count, 0) ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-slate">
          {scanning
            ? "Scanning every source…"
            : data
              ? `Last sweep ${new Date(data.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
        </p>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="rounded-input bg-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-deep disabled:opacity-50"
        >
          {scanning ? "Scanning." : "Sweep again."}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-card border border-line bg-white p-6 text-sm text-slate">
          The sweep failed ({error}). The sources are probably fine — try again.
        </p>
      ) : null}

      {scanning && !data ? (
        <p className="mt-4 rounded-card border border-line bg-white p-6 text-sm text-slate">
          Reading all sources. This takes a few seconds — it is the real
          internet, not a cache.
        </p>
      ) : null}

      {data ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile
              label="Sources up"
              value={`${okSources.length}/${data.report.length}`}
              hint={downSources.length ? `${downSources.length} unreachable` : "All reporting."}
            />
            <Tile label="Items pulled" value={String(pulled)} hint="across all feeds" />
            <Tile
              label="Fresh + new"
              value={String(data.items.length)}
              hint="this week, not yet used"
            />
            <Tile
              label="Read in full"
              value="Top 3"
              hint="per run, via Jina Reader"
            />
          </section>

          <section className="mt-8">
            <h2 className="eyebrow text-slate">Source health</h2>
            <ul className="mt-3 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
              {data.report
                .slice()
                .sort((a, b) => Number(b.ok) - Number(a.ok) || b.count - a.count)
                .map((r) => (
                  <li key={r.source} className="flex items-center gap-3 bg-white px-4 py-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${r.ok ? "bg-indigo" : "bg-slate"}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                      {r.source}
                    </span>
                    <span className="eyebrow text-slate">
                      {r.ok ? `${r.count} items` : "down"}
                    </span>
                  </li>
                ))}
            </ul>
            {downSources.length ? (
              <p className="mt-2 text-xs text-slate">
                Down usually means the site is slow or blocking right now, not
                broken forever. The pipeline skips it and moves on.
              </p>
            ) : null}
          </section>

          <section className="mt-8">
            <h2 className="eyebrow text-slate">
              What a run would pick from — ranked
            </h2>
            {data.items.length === 0 ? (
              <p className="mt-3 rounded-card border border-line bg-white p-6 text-sm text-slate">
                Nothing fresh survived the filters. Either the week is quiet or
                every story was already used.
              </p>
            ) : (
              <ul className="mt-3 overflow-hidden rounded-card border border-line bg-white">
                {data.items.map((item, i) => (
                  <li key={item.url} className={i > 0 ? "border-t border-line" : ""}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-paper"
                    >
                      <span className="eyebrow w-7 shrink-0 pt-0.5 text-indigo">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {item.title}
                        </span>
                        {item.summary ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-slate">
                            {item.summary}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-xs text-slate">
                          {item.source} · tier {item.tier}
                          {age(item.publishedAt) ? ` · ${age(item.publishedAt)}` : ""}
                        </span>
                      </span>
                      <span className="eyebrow shrink-0 rounded-full border border-line px-2.5 py-1 text-slate">
                        {item.score} pts
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
