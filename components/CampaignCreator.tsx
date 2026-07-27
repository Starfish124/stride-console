"use client";

import { useState } from "react";
import { CATEGORY_LABEL, TEMPLATES } from "@/lib/outreach/templates";
import type { TemplateCategory } from "@/lib/outreach/templates";
import { IconSpark, IconLayers, IconTeam, IconApproved, IconEscalate } from "@/components/icons";
import { Working } from "@/components/Loader";

/**
 * Making a campaign from the phone.
 *
 * The console does not write to Linked Helper's database. It drives LH2's own
 * wizard, so LH2 builds its own rows and its own defaults, then the result is
 * checked against the database before this says it worked.
 *
 * Every template arrives paused with its steps unarmed, so nothing here can
 * message anybody. Templates that would eventually reach real people are
 * marked, because that is worth knowing before you pick one, not after.
 */

const CATEGORY_ICON: Record<TemplateCategory, typeof IconSpark> = {
  reach: IconSpark,
  collect: IconLayers,
  nurture: IconTeam,
};

const ORDER: TemplateCategory[] = ["reach", "collect", "nurture"];

export function CampaignCreator({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function create() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, template: picked }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `"${name}" is in Linked Helper, paused and unarmed.` });
        setName("");
        setPicked("");
        setTimeout(() => {
          onDone?.();
          location.reload();
        }, 1800);
      } else {
        setResult({ ok: false, message: data.detail ?? data.error ?? "That did not work." });
      }
    } catch {
      setResult({ ok: false, message: "Could not reach the bridge." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable card-glass flex w-full items-center gap-3 rounded-card border border-line bg-white px-5 py-4 text-left"
      >
        <IconSpark size={22} className="shrink-0 text-indigo" />
        <span className="flex-1">
          <span className="block text-[15px] font-semibold text-ink">Make a campaign</span>
          <span className="block text-[13px] text-slate">
            Pick a template. It arrives paused, so nothing sends.
          </span>
        </span>
      </button>
    );
  }

  const ready = name.trim().length > 0 && picked.length > 0;

  return (
    <section className="card-glass rounded-card border border-line bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="display text-[20px] text-ink">Make a campaign.</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] text-slate hover:text-indigo"
        >
          Cancel
        </button>
      </div>

      <label className="eyebrow mt-4 block text-slate" htmlFor="camp-name">
        Name
      </label>
      <input
        id="camp-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Lelystad wholesalers, August"
        className="mt-2 w-full rounded-input border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-mute focus:border-indigo"
      />

      <p className="eyebrow mt-5 text-slate">Template</p>

      {ORDER.map((category) => {
        const Icon = CATEGORY_ICON[category];
        return (
          <div key={category} className="mt-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Icon size={16} className="text-indigo" />
              {CATEGORY_LABEL[category]}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {TEMPLATES.filter((t) => t.category === category).map((t) => {
                const active = picked === t.name;
                return (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => setPicked(t.name)}
                      className={`pressable w-full rounded-input border px-3.5 py-2.5 text-left ${
                        active ? "border-indigo bg-indigo-tint" : "border-line bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`text-[14px] font-semibold ${active ? "text-indigo" : "text-ink"}`}
                        >
                          {t.name}
                        </span>
                        {t.reachesPeople ? (
                          <IconEscalate size={14} className="ml-auto shrink-0 text-amber" />
                        ) : (
                          <IconApproved size={14} className="ml-auto shrink-0 text-lime" />
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-slate">
                        {t.blurb}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <button
        type="button"
        onClick={create}
        disabled={!ready || busy}
        className="mt-5 w-full rounded-input bg-indigo px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? (
          <Working onDark>Making it.</Working>
        ) : ready ? (
          `Create "${name.trim()}"`
        ) : (
          "Name it and pick a template"
        )}
      </button>

      {result && (
        <p
          className={`mt-3 rounded-input border px-3.5 py-2.5 text-[13px] ${
            result.ok
              ? "border-lime/40 bg-lime/10 text-ink"
              : "border-amber/50 bg-amber/10 text-ink"
          }`}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
