"use client";

import { useState } from "react";
import type { LhAccountCampaigns, LhCampaign } from "@/lib/channels/linkedHelper";
import { Working } from "@/components/Loader";

/**
 * The Linked Helper panel: what the machine is doing, in detail, and the
 * controls that change it.
 *
 * Light surfaces throughout. The flavour comes from the type and the mark's
 * shear, not from a dark slab: figures in Playfair, a sheared rule under each,
 * and a status line that says what is actually happening rather than printing
 * a number and leaving you to guess.
 */

const STATE: Record<LhCampaign["state"], { label: string; pill: string; mark: string }> = {
  running: {
    label: "Running",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    mark: "text-emerald-500",
  },
  paused: { label: "Paused", pill: "bg-paper text-slate border-line", mark: "text-slate/40" },
  archived: { label: "Archived", pill: "bg-paper text-slate border-line", mark: "text-slate/25" },
  invalid: {
    label: "Not ready",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    mark: "text-amber-500",
  },
};

/** LH2's internal action names, in words a founder reads. */
const STEP_LABEL: Record<string, string> = {
  ICPDetection: "Score against the ICP",
  AutoCollectPeople: "Collect profiles",
  InvitePerson: "Send connection requests",
  FilterContactsOutOfMyNetwork: "Check who accepted",
  AIPersonalizedMessages: "Write personalised messages",
  MessageToPerson: "Message connections",
  CheckForReplies: "Watch for replies",
  DataEnrichment: "Enrich profile data",
  EndorseSkills: "Endorse skills",
  FollowProfiles: "Follow profiles",
  SendPersonToWebhook: "Send to the console",
  VisitAndExtract: "Visit and extract",
  FindProfileEmails: "Find emails",
};

interface Refusal {
  detail: string;
  reach?: number;
  campaigns?: Array<{ name: string; people: number }>;
}

export function CampaignDeck({ entry }: { entry: LhAccountCampaigns }) {
  const [busy, setBusy] = useState<"" | "run" | "stop">("");
  const [note, setNote] = useState("");
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const live = entry.campaigns.filter((c) => c.state === "running");
  const armedReach = live.reduce((n, c) => n + c.people, 0);
  const sending = live.filter((c) => c.steps.some((s) => s.armed && /Invite|Message/i.test(s.type ?? "")));

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

  /* What is happening, in a sentence. A campaign can be "running" while every
     step that touches a person is still a draft, and that distinction is the
     difference between nothing and six days of invitations. */
  const status =
    live.length === 0
      ? "Nothing is running. Starting the runner begins any campaign that is not paused."
      : sending.length === 0
        ? `${live.length} campaign${live.length === 1 ? "" : "s"} running. No sending step is armed, so only research and scoring will happen.`
        : `${sending.length} campaign${sending.length === 1 ? "" : "s"} can reach people. ${armedReach.toLocaleString("en-GB")} in the queue, ${entry.dailyMax ?? "no"} per day.`;

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] text-ink">
          {entry.account.name?.replace(/\s+/g, " ") ?? "Linked Helper"}
        </h2>
        <p className="text-[13px] text-slate">{entry.account.email}</p>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure value={entry.campaigns.length} label="Campaigns" />
        <Figure value={live.length} label="Running" accent={live.length > 0} />
        <Figure value={entry.peopleCollected} label="Profiles" />
        <Figure value={entry.dailyMax ?? 0} label="Daily cap" />
      </dl>

      <div className="card-glass mb-4 rounded-card border border-line bg-white p-5">
        <p className="text-[15px] leading-snug text-ink">{status}</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => act("run")}
            disabled={busy !== ""}
            className="rounded-input bg-indigo px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "run" ? <Working onDark>Starting.</Working> : "Start the runner"}
          </button>
          <button
            type="button"
            onClick={() => act("stop")}
            disabled={busy !== ""}
            className="rounded-input border border-line bg-white px-5 py-2.5 text-[15px] font-semibold text-ink disabled:opacity-50"
          >
            {busy === "stop" ? <Working>Stopping.</Working> : "Stop"}
          </button>
        </div>

        {note && <p className="mt-3 text-[13px] text-slate">{note}</p>}

        {refusal && (
          <div className="mt-4 rounded-input border border-amber-200 bg-amber-50 p-4">
            <p className="eyebrow text-amber-700">Refused</p>
            <p className="mt-1.5 text-[14px] leading-snug text-amber-900">{refusal.detail}</p>
            {refusal.campaigns && refusal.campaigns.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {refusal.campaigns.map((c) => (
                  <li key={c.name} className="tabular text-[13px] text-amber-800">
                    {c.name}: {c.people.toLocaleString("en-GB")} people
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => act("run", true)}
              className="mt-3 rounded-input border border-amber-300 bg-white px-4 py-2 text-[14px] font-semibold text-amber-900"
            >
              I know. Start it anyway.
            </button>
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {entry.campaigns.map((campaign) => {
          const state = STATE[campaign.state];
          return (
            <li
              key={campaign.uuid}
              className="card-glass rounded-card border border-line bg-white p-5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span aria-hidden className={`slant-rule w-3 shrink-0 ${state.mark}`} />
                <span className="display text-[18px] text-ink">{campaign.name}</span>
                <span className={`eyebrow rounded-full border px-2.5 py-0.5 ${state.pill}`}>
                  {state.label}
                </span>
              </div>

              <p className="tabular mt-2 text-[13px] text-slate">
                {campaign.people.toLocaleString("en-GB")} people · {campaign.type} ·{" "}
                {campaign.armedSteps} of {campaign.stepCount} steps armed
              </p>

              {campaign.steps.length > 0 && (
                <ol className="mt-3 flex flex-col gap-1.5">
                  {campaign.steps.map((step, i) => (
                    <li key={i} className="flex items-baseline gap-2.5 text-[13px]">
                      <span
                        className={`eyebrow shrink-0 ${step.armed ? "text-indigo" : "text-slate/50"}`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className={step.armed ? "text-ink" : "text-slate/70"}>
                        {step.name || STEP_LABEL[step.type ?? ""] || step.type || "Unnamed step"}
                      </span>
                      {!step.armed && (
                        <span className="eyebrow ml-auto shrink-0 text-slate/50">draft</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Figure({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="card-glass rounded-card border border-line bg-white px-4 py-3.5">
      <dd className={`figure text-[28px] ${accent ? "text-indigo" : "text-ink"}`}>
        {value.toLocaleString("en-GB")}
      </dd>
      <span
        aria-hidden
        className={`slant-rule mt-2 w-5 ${accent ? "text-indigo" : "text-line"}`}
      />
      <dt className="eyebrow mt-2 text-slate">{label}</dt>
    </div>
  );
}
