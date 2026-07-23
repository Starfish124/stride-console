"use client";

import { useState } from "react";
import type { Destination, PostStats } from "@/lib/types";

const FIELDS: { key: keyof Omit<PostStats, "recordedAt">; label: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "reactions", label: "Reactions" },
  { key: "comments", label: "Comments" },
  { key: "saves", label: "Saves" },
];

/** Manual stats entry for a posted destination. Feeds the feedback memory. */
export function StatsForm({
  draftId,
  destination,
  existing,
}: {
  draftId: string;
  destination: Destination;
  existing?: PostStats;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    impressions: existing ? String(existing.impressions) : "",
    reactions: existing ? String(existing.reactions) : "",
    comments: existing ? String(existing.comments) : "",
    saves: existing ? String(existing.saves) : "",
  });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const res = await fetch(`/api/drafts/${draftId}/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination,
        impressions: Number(values.impressions || 0),
        reactions: Number(values.reactions || 0),
        comments: Number(values.comments || 0),
        saves: Number(values.saves || 0),
      }),
    });
    setState(res.ok ? "saved" : "failed");
    if (res.ok) setTimeout(() => setState("idle"), 2500);
  }

  return (
    <form
      onSubmit={save}
      className="mt-6 rounded-card border border-line bg-white p-5"
    >
      <p className="eyebrow text-slate">The numbers</p>
      <p className="mt-2 text-sm text-slate">
        Copy the numbers from LinkedIn a day or two after posting. The writer
        learns from what worked.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="eyebrow text-slate">{f.label}</span>
            <input
              type="number"
              min={0}
              value={values[f.key]}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
              className="rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-indigo"
            />
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={state === "saving"}
        className="mt-4 rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-60"
      >
        {state === "saved"
          ? "Saved."
          : state === "failed"
            ? "That failed. Try again."
            : "Save the numbers."}
      </button>
    </form>
  );
}
