"use client";

import { useState } from "react";
import type { LhAccountCampaigns, LhCampaign } from "@/lib/channels/linkedHelper";

/**
 * The Linked Helper deck: what the machine is doing, and the two controls that
 * change it.
 *
 * It sits on midnight rather than paper. The editorial white is right for
 * reading drafts and wrong for machine state, and the contrast is what stops
 * this page reading like every other dashboard.
 */

const STATE: Record<LhCampaign["state"], { label: string; dot: string; text: string }> = {
  running: { label: "Running", dot: "bg-emerald-400", text: "text-emerald-300" },
  paused: { label: "Paused", dot: "bg-white/30", text: "text-white/60" },
  archived: { label: "Archived", dot: "bg-white/20", text: "text-white/40" },
  invalid: { label: "Not ready", dot: "bg-amber-400", text: "text-amber-300" },
};

interface Refusal {
  detail: string;
  reach?: number;
  campaigns?: Array<{ name: string; people: number }>;
}

export function CampaignDeck({ entry }: { entry: LhAccountCampaigns }) {
  const [busy, setBusy] = useState<"" | "run" | "stop">("");
  const [note, setNote] = useState<string>("");
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const live = entry.campaigns.filter((c) => c.state === "running");
  const armedReach = live.reduce((n, c) => n + c.people, 0);

  async function act(action: "run" | "stop", force = false) {
    setBusy(action);
    setNote("");
    setRefusal(null);
    try {
      const res = await fetch(`/api/campaigns/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: entry.account.email, force }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setRefusal({ detail: data.detail ?? data.error, reach: data.reach, campaigns: data.campaigns });
      } else if (!res.ok) {
        setNote(data.detail ?? data.error ?? "That did not work.");
      } else {
        setNote(action === "run" ? "Runner started." : "Runner stopped.");
        setTimeout(() => location.reload(), 2500);
      }
    } catch {
      setNote("Could not reach the bridge.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="deck card-raised mb-8 overflow-hidden rounded-card">
      <div className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="eyebrow text-white/50">Linked Helper</p>
          <p className="text-[13px] text-white/50">{entry.account.email}</p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4">
          <Figure value={entry.campaigns.length} label="Campaigns" />
          <Figure value={live.length} label="Running" accent={live.length > 0} />
          <Figure value={entry.peopleCollected} label="Profiles" />
        </div>

        <p className="mt-4 text-[13px] leading-snug text-white/60">
          {live.length === 0
            ? "Nothing is sending. Starting the runner will begin any campaign that is not paused."
            : `${armedReach.toLocaleString("en-GB")} people are in reach of the ${live.length} running campaign${live.length === 1 ? "" : "s"}. Daily cap ${entry.dailyMax ?? "unset"}.`}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => act("run")}
            disabled={busy !== ""}
            className="rounded-input bg-white px-5 py-2.5 text-[15px] font-semibold text-ink disabled:opacity-50"
          >
            {busy === "run" ? "Starting." : "Start the runner"}
          </button>
          <button
            type="button"
            onClick={() => act("stop")}
            disabled={busy !== ""}
            className="rounded-input border border-white/25 px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "stop" ? "Stopping." : "Stop"}
          </button>
        </div>

        {note && <p className="mt-3 text-[13px] text-white/70">{note}</p>}

        {refusal && (
          <div className="mt-4 rounded-input border border-amber-300/40 bg-amber-300/10 p-4">
            <p className="eyebrow text-amber-200">Refused</p>
            <p className="mt-1.5 text-[14px] leading-snug text-amber-50">{refusal.detail}</p>
            {refusal.campaigns && refusal.campaigns.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {refusal.campaigns.map((c) => (
                  <li key={c.name} className="tabular text-[13px] text-amber-100/80">
                    {c.name}: {c.people.toLocaleString("en-GB")} people
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => act("run", true)}
              className="mt-3 rounded-input border border-amber-300/50 px-4 py-2 text-[14px] font-semibold text-amber-50"
            >
              I know. Start it anyway.
            </button>
          </div>
        )}
      </div>

      <ul className="border-t border-white/10">
        {entry.campaigns.map((campaign) => {
          const state = STATE[campaign.state];
          return (
            <li
              key={campaign.uuid}
              className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-3.5 last:border-b-0"
            >
              <span aria-hidden className={`slant-rule w-2.5 shrink-0 ${state.text}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-white">{campaign.name}</span>
                <span className="tabular block text-[12px] text-white/45">
                  {campaign.people.toLocaleString("en-GB")} people · {campaign.stepCount} steps ·{" "}
                  {campaign.type}
                </span>
              </span>
              <span className={`eyebrow shrink-0 ${state.text}`}>{state.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Figure({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`figure text-[30px] ${accent ? "text-emerald-300" : "text-white"}`}>
        {value.toLocaleString("en-GB")}
      </p>
      <span
        aria-hidden
        className={`slant-rule mt-2 w-6 ${accent ? "text-emerald-300" : "text-indigo"}`}
      />
      <p className="eyebrow mt-2 text-white/45">{label}</p>
    </div>
  );
}
