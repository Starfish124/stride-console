"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChipField } from "@/components/ChipField";
import { Working } from "@/components/Loader";

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

/**
 * The search, as a filter rail.
 *
 * Two things make this feel like a prospecting tool rather than a form. The
 * values are chips, so the search is a thing you can see and take apart rather
 * than a comma-separated string. And the count follows the chips: searching
 * Apollo costs nothing, so there is no reason to make somebody press a button
 * to find out whether the change they just made helped.
 *
 * The two-press safety on spending stays exactly as it was. Revealing costs a
 * credit each and data/ is gitignored, so the preview is the only undo there is.
 */
export function LeadPull({ icp, configured }: { icp: Icp; configured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(icp);
  const [pool, setPool] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [preview, setPreview] = useState<PullResult | undefined>();
  const [note, setNote] = useState("");

  const dirty = JSON.stringify(form) !== JSON.stringify(icp);

  // The count follows the search, debounced so a burst of typing is one call.
  useEffect(() => {
    if (!configured) return;
    let live = true;
    // The pending flag is set when the debounce fires, not when the effect
    // runs: a synchronous setState here would re-render on every keystroke to
    // say "counting" about a request that has not been made yet.
    const timer = setTimeout(async () => {
      if (!live) return;
      setCounting(true);
      try {
        const res = await fetch("/api/leads/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: true, ...form }),
        });
        const json = (await res.json()) as { pool?: number };
        if (live) setPool(typeof json.pool === "number" ? json.pool : null);
      } catch {
        if (live) setPool(null);
      } finally {
        if (live) setCounting(false);
      }
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [form, configured]);

  function save() {
    setNote("");
    startTransition(async () => {
      const res = await fetch("/api/leads/pull", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) return setNote("That did not save.");
      toast.success("Search saved. The 09:30 pull uses it.");
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
        // The search on screen, so the price is for what is being looked at.
        body: JSON.stringify({ confirm, ...form }),
      });
      const json = (await res.json().catch(() => ({}))) as PullResult;
      if (!res.ok || !json.ok) return setNote(json.problem ?? "Apollo did not answer.");
      if (confirm) {
        setPreview(undefined);
        toast.success(`${json.added} added for ${json.enriched} credits.`);
        router.refresh();
        return;
      }
      setPreview(json);
    });
  }

  if (!configured) {
    return (
      <p className="text-[13px] text-slate">
        No <span className="font-mono text-[12px]">APOLLO_API_KEY</span> set, so nothing here can
        search.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The pool, the way a prospecting tool leads with it. */}
      <div className="rounded-card border border-line bg-white px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow text-slate">People matching</span>
          {counting ? <Working>Counting</Working> : null}
        </div>
        <p className="figure mt-1 text-[26px] text-ink">
          {pool === null ? "—" : pool.toLocaleString("en-GB")}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-mute">
          Searching is free. Revealing an address and a profile costs one credit each.
        </p>
      </div>

      <ChipField
        label="Job titles"
        values={form.titles}
        placeholder="Operations Manager"
        onChange={(titles) => setForm({ ...form, titles })}
      />
      <ChipField
        label="Industry words"
        hint="Matched against the company, not the person. This is what makes it your list."
        values={form.keywords}
        placeholder="wholesale"
        onChange={(keywords) => setForm({ ...form, keywords })}
      />
      <ChipField
        label="Locations"
        values={form.locations}
        placeholder="Netherlands"
        onChange={(locations) => setForm({ ...form, locations })}
      />
      <ChipField
        label="Headcount"
        hint="Apollo's own spelling of a band, like 51,200."
        values={form.employeeRanges}
        placeholder="51,200"
        onChange={(employeeRanges) => setForm({ ...form, employeeRanges })}
      />

      <label className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="eyebrow text-slate">Credits per run</span>
          <span className="num text-[11px] text-mute">0 pauses it</span>
        </div>
        <input
          value={String(form.perRun)}
          inputMode="numeric"
          onChange={(e) => setForm({ ...form, perRun: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          className="min-h-[38px] rounded-input border border-line bg-white px-3 text-[14px] text-ink"
        />
      </label>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          className="pressable min-h-[38px] rounded-input border border-line px-4 text-[14px] text-ink disabled:opacity-40"
        >
          {dirty ? "Save this search" : "Saved"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => pull(false)}
          className="pressable min-h-[38px] rounded-input border border-line px-4 text-[14px] text-ink disabled:opacity-50"
        >
          What would it cost?
        </button>
        {preview && preview.added > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => pull(true)}
            className="pressable min-h-[38px] rounded-input bg-ink px-4 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            Reveal {preview.added} for {preview.added} credits
          </button>
        ) : null}
      </div>

      {preview ? (
        <p className="text-[12px] leading-snug text-slate">
          {preview.added} would be revealed
          {preview.alreadyHeld > 0 ? `, ${preview.alreadyHeld} already held` : ""}
          {preview.noEmail > 0 ? `, ${preview.noEmail} with no address` : ""}. The ceiling is{" "}
          {preview.ceiling}. Nothing spent yet.
        </p>
      ) : null}

      {note ? <p className="text-[12px] text-amber-deep">{note}</p> : null}

      <p className="text-[11px] leading-snug text-mute">
        This search runs by itself at 09:30 on weekdays, up to {icp.perRun} credits a time.
      </p>
    </div>
  );
}
