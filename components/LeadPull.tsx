"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface Icp {
  titles: string[];
  locations: string[];
  employeeRanges: string[];
  keywords: string[];
  perRun: number;
}

interface PullResult {
  ok: boolean;
  problem?: string;
  pool: number;
  alreadyHeld: number;
  noEmail: number;
  enriched: number;
  added: number;
  ceiling: number;
  dryRun: boolean;
}

const asList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/**
 * The search Apollo runs, and the button that spends money.
 *
 * Searching is free and revealing a person costs one credit, so the two are
 * kept visibly apart: "See what it would cost" never spends, and the number it
 * reports is the number the other button charges for. The ceiling is on screen
 * because an unattended job runs this same search at 09:30 every weekday, and
 * a limit nobody can see is a limit nobody trusts.
 */
export function LeadPull({ icp, configured }: { icp: Icp; configured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    titles: icp.titles.join(", "),
    locations: icp.locations.join(", "),
    employeeRanges: icp.employeeRanges.join(", "),
    keywords: icp.keywords.join(", "),
    perRun: String(icp.perRun),
  });
  const [preview, setPreview] = useState<PullResult | undefined>();
  const [note, setNote] = useState("");

  function saveIcp() {
    setNote("");
    startTransition(async () => {
      const res = await fetch("/api/leads/pull", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titles: asList(form.titles),
          locations: asList(form.locations),
          employeeRanges: asList(form.employeeRanges),
          keywords: asList(form.keywords),
          perRun: Number(form.perRun) || 0,
        }),
      });
      setNote(res.ok ? "Saved. The 09:30 pull uses this." : "That did not save.");
      setPreview(undefined);
      router.refresh();
    });
  }

  function pull(confirm: boolean) {
    setNote("");
    startTransition(async () => {
      const res = await fetch("/api/leads/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The search on screen, so the price quoted is for what is being
        // looked at. Sending only { confirm } priced whatever was last saved.
        body: JSON.stringify({
          confirm,
          titles: asList(form.titles),
          locations: asList(form.locations),
          employeeRanges: asList(form.employeeRanges),
          keywords: asList(form.keywords),
          perRun: Number(form.perRun) || 0,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as PullResult;
      if (!res.ok || !json.ok) {
        setNote(json.problem ?? "Apollo did not answer.");
        return;
      }
      if (confirm) {
        setPreview(undefined);
        setNote(`${json.added} added for ${json.enriched} credits.`);
        router.refresh();
        return;
      }
      setPreview(json);
    });
  }

  if (!configured) {
    return (
      <p className="text-[15px] text-slate">
        No <span className="font-mono text-[13px]">APOLLO_API_KEY</span> set, so nothing here can
        search. The lead book still reads whatever is on disk.
      </p>
    );
  }

  const fields: { key: keyof typeof form; label: string; hint: string }[] = [
    { key: "titles", label: "Titles", hint: "comma separated" },
    { key: "keywords", label: "Industry words", hint: "matched against the company" },
    { key: "locations", label: "Locations", hint: "" },
    { key: "employeeRanges", label: "Headcount", hint: "Apollo's spelling, e.g. 51,200" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="eyebrow text-slate">
              {f.label}
              {f.hint ? <span className="ml-2 normal-case tracking-normal text-[11px]">{f.hint}</span> : null}
            </span>
            <input
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className="rounded-input border border-line px-3 py-2 text-[14px] text-ink"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">
            Credits per run<span className="ml-2 normal-case tracking-normal text-[11px]">0 pauses it</span>
          </span>
          <input
            value={form.perRun}
            inputMode="numeric"
            onChange={(e) => setForm({ ...form, perRun: e.target.value.replace(/\D/g, "") })}
            className="rounded-input border border-line px-3 py-2 text-[14px] text-ink"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button" disabled={pending} onClick={saveIcp}
          className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink disabled:opacity-50"
        >
          Save the search
        </button>
        <button
          type="button" disabled={pending} onClick={() => pull(false)}
          className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink disabled:opacity-50"
        >
          {pending && !preview ? "Searching." : "See what it would cost"}
        </button>
        {preview && preview.added > 0 ? (
          <button
            type="button" disabled={pending} onClick={() => pull(true)}
            className="pressable rounded-input bg-ink px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Revealing." : `Reveal ${preview.added} for ${preview.added} credits`}
          </button>
        ) : null}
      </div>

      {preview ? (
        <p className="text-[14px] text-slate">
          {preview.pool.toLocaleString("en-GB")} people match. {preview.added} would be revealed
          {preview.alreadyHeld > 0 ? `, ${preview.alreadyHeld} skipped as already held` : ""}
          {preview.noEmail > 0 ? `, ${preview.noEmail} skipped with no address` : ""} — the ceiling is{" "}
          {preview.ceiling}. Nothing has been spent yet.
        </p>
      ) : null}

      {note ? <p className="text-[14px] text-ink">{note}</p> : null}

      <p className="text-[13px] text-slate">
        This same search runs by itself at 09:30 on weekdays, up to {icp.perRun} credits a time.
        Set that to zero to pause it.
      </p>
    </div>
  );
}
