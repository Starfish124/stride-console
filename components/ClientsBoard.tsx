"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CLIENT_STAGES,
  STAGE_HINTS,
  STAGE_LABELS,
  type Client,
  type ClientStage,
} from "@/lib/types";
import { IconTeam, IconTime } from "@/components/icons";

/**
 * Everyone in play, in columns by stage.
 *
 * A pipeline board, not a CRM. The columns are the five things a founder
 * actually says out loud, moving somebody along is one tap on the row, and
 * the only field the board itself insists on is the next step — because an
 * agreed next step with no date is how a lead goes quiet without anyone
 * noticing it happened.
 */

const STAGE_TONE: Record<ClientStage, string> = {
  lead: "text-slate",
  talking: "text-signal",
  proposal: "text-amber",
  client: "text-lime",
  past: "text-mute",
};

function euros(n: number): string {
  return `€${n.toLocaleString("en-GB")}`;
}

/** Today, in the same yyyy-mm-dd shape the date input produces. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dueLabel(date: string): { text: string; overdue: boolean } {
  const now = today();
  if (date < now) return { text: "Overdue", overdue: true };
  if (date === now) return { text: "Today", overdue: true };
  const days = Math.round((Date.parse(date) - Date.parse(now)) / 86_400_000);
  if (days === 1) return { text: "Tomorrow", overdue: false };
  if (days <= 14) return { text: `In ${days} days`, overdue: false };
  return {
    text: new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    overdue: false,
  };
}

export function ClientsBoard({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    company: "",
    stage: "lead" as ClientStage,
    source: "",
    need: "",
    value: "",
    nextStep: "",
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() && !form.company.trim()) return;
    setBusy(true);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) return;
    setForm({
      name: "",
      company: "",
      stage: "lead",
      source: "",
      need: "",
      value: "",
      nextStep: "",
    });
    setAdding(false);
    router.refresh();
  }

  async function move(client: Client, stage: ClientStage) {
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    router.refresh();
  }

  const field =
    "w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="eyebrow text-slate">
          {clients.length} in the book
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-input border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-midnight"
        >
          {adding ? "Never mind." : "Add somebody."}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={add}
          className="card-glass mb-8 grid gap-3 rounded-card border border-line bg-white p-5 sm:grid-cols-2"
        >
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Their name"
            className={field}
          />
          <input
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            placeholder="Company"
            className={field}
          />
          <select
            value={form.stage}
            onChange={(e) => setForm({ ...form, stage: e.target.value as ClientStage })}
            className={field}
          >
            {CLIENT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="Where they came from"
            className={field}
          />
          <input
            value={form.need}
            onChange={(e) => setForm({ ...form, need: e.target.value })}
            placeholder="What they need, in your words"
            className={`${field} sm:col-span-2`}
          />
          <input
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            inputMode="numeric"
            placeholder="Deal size in euros, if it has been said"
            className={field}
          />
          <label className="flex items-center gap-2 text-sm text-slate">
            <span className="shrink-0">Next step</span>
            <input
              type="date"
              value={form.nextStep}
              onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
              className={field}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-input border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-midnight disabled:opacity-50 sm:col-span-2"
          >
            {busy ? "Saving." : "Add them."}
          </button>
        </form>
      )}

      {clients.length === 0 && !adding && (
        <p className="card-glass flex items-center gap-2.5 rounded-card border border-line bg-white px-5 py-4 text-[15px] text-slate">
          <IconTeam size={18} className="shrink-0 text-mute" />
          Nobody in the book yet. Add the first lead and it lands here.
        </p>
      )}

      {/* Columns on a desk, one under the other on a phone: a five-wide board
          on a 402px screen is five slivers nobody can read. */}
      <div className="grid gap-6 lg:grid-cols-5">
        {CLIENT_STAGES.map((stage) => {
          const inStage = clients.filter((c) => c.stage === stage);
          if (inStage.length === 0 && stage === "past") return null;
          const total = inStage.reduce((sum, c) => sum + (c.value ?? 0), 0);
          return (
            <section key={stage}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h2 className="display text-[17px] text-ink">{STAGE_LABELS[stage]}</h2>
                <span className={`tabular text-[13px] ${STAGE_TONE[stage]}`}>
                  {inStage.length}
                </span>
              </div>
              <div className={`slant-rule mb-2.5 w-8 ${STAGE_TONE[stage]}`} />
              {/* The hint explains a column you are looking at. An empty one
                  has nothing to look at, and five paragraphs about columns
                  with nobody in them is most of a phone screen. */}
              {inStage.length > 0 && (
                <p className="mb-3 text-[12px] leading-snug text-mute">
                  {STAGE_HINTS[stage]}
                  {total > 0 && ` ${euros(total)} in this column.`}
                </p>
              )}

              <ul className="flex flex-col gap-2.5">
                {inStage.map((c) => {
                  const due = c.nextStep ? dueLabel(c.nextStep) : null;
                  return (
                    <li
                      key={c.id}
                      className="card-glass rounded-card border border-line bg-white"
                    >
                      <Link
                        href={`/clients/${c.id}`}
                        className="block px-4 pb-2 pt-3.5 hover:bg-paper"
                      >
                        <span className="block text-[15px] font-semibold leading-snug text-ink">
                          {c.company}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                          {c.name}
                          {c.role && ` · ${c.role}`}
                        </span>
                        {c.need && (
                          <span className="mt-1.5 block text-[13px] leading-snug text-slate">
                            {c.need}
                          </span>
                        )}
                        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {c.value ? (
                            <span className="tabular text-[13px] font-semibold text-ink">
                              {euros(c.value)}
                            </span>
                          ) : null}
                          {due && (
                            <span
                              className={`flex items-center gap-1 text-[12px] ${
                                due.overdue ? "font-semibold text-amber" : "text-slate"
                              }`}
                            >
                              <IconTime size={13} className="shrink-0" />
                              {due.text}
                            </span>
                          )}
                        </span>
                      </Link>

                      {/* Moving somebody is the most common edit on this page,
                          so it does not require opening them first. */}
                      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
                        {CLIENT_STAGES.filter((s) => s !== stage).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => move(c, s)}
                            title={`Move to ${STAGE_LABELS[s]}`}
                            className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-mute hover:bg-indigo-tint hover:text-indigo"
                          >
                            {STAGE_LABELS[s].split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
