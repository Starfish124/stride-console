"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CLIENT_STAGES,
  STAGE_LABELS,
  type Client,
  type ClientStage,
} from "@/lib/types";
import { IconLineageDoc, IconLayers, IconTime } from "@/components/icons";

/**
 * One person, everything about them.
 *
 * Edits save on blur rather than behind a Save button: this page gets opened
 * on a phone between meetings, and a form that loses what was typed because
 * nobody found the button is worse than one that saves a stray keystroke.
 */

function Field({
  label,
  value,
  onSave,
  placeholder,
  type = "text",
  multiline,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const shared =
    "w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo";
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block text-slate">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onSave(draft)}
          className={shared}
        />
      ) : (
        <input
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onSave(draft)}
          className={shared}
        />
      )}
    </label>
  );
}

export function ClientDetail({ client, deckUrl }: { client: Client; deckUrl?: string }) {
  const router = useRouter();
  const [touch, setTouch] = useState("");

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function logTouch(e: React.FormEvent) {
    e.preventDefault();
    if (!touch.trim()) return;
    await patch({ touch });
    setTouch("");
  }

  async function remove() {
    // A lead is cheap to re-add and expensive to lose by accident, so this is
    // the one action on the page that asks first.
    if (!confirm(`Remove ${client.company} from the book?`)) return;
    await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
    router.push("/clients");
    router.refresh();
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <section className="mb-8">
          <p className="eyebrow mb-2 text-slate">Stage</p>
          <div className="flex flex-wrap gap-1.5">
            {CLIENT_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patch({ stage: s })}
                aria-pressed={client.stage === s}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                  client.stage === s
                    ? "bg-ink text-white"
                    : "border border-line bg-white text-slate hover:border-indigo/30 hover:text-indigo"
                }`}
              >
                {STAGE_LABELS[s as ClientStage]}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={client.name} onSave={(v) => patch({ name: v })} />
          <Field label="Company" value={client.company} onSave={(v) => patch({ company: v })} />
          <Field label="Role" value={client.role ?? ""} onSave={(v) => patch({ role: v })} />
          <Field
            label="Where they came from"
            value={client.source ?? ""}
            onSave={(v) => patch({ source: v })}
            placeholder="An event, a campaign, a referral"
          />
          <Field label="Email" type="email" value={client.email ?? ""} onSave={(v) => patch({ email: v })} />
          <Field label="LinkedIn" value={client.linkedin ?? ""} onSave={(v) => patch({ linkedin: v })} />
          <Field
            label="Deal size in euros"
            type="number"
            value={client.value != null ? String(client.value) : ""}
            onSave={(v) => patch({ value: v })}
          />
          <Field label="Owner" value={client.owner ?? ""} onSave={(v) => patch({ owner: v })} />
          <div className="sm:col-span-2">
            <Field
              label="What they need"
              multiline
              value={client.need ?? ""}
              onSave={(v) => patch({ need: v })}
              placeholder="In your words, the way they said it"
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="What Stride would do about it"
              multiline
              value={client.proposed ?? ""}
              onSave={(v) => patch({ proposed: v })}
              placeholder="This is what the one-pager leads with"
            />
          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <Field
            label="Next step, on what date"
            type="date"
            value={client.nextStep ?? ""}
            onSave={(v) => patch({ nextStep: v })}
          />
          <Field
            label="And what it is"
            value={client.nextStepNote ?? ""}
            onSave={(v) => patch({ nextStepNote: v })}
            placeholder="Send the proposal"
          />
        </section>

        <button
          type="button"
          onClick={remove}
          className="text-[13px] font-semibold text-mute hover:text-amber"
        >
          Remove from the book.
        </button>
      </div>

      <div>
        {/* What is ready to send, before the history — this is the block the
            page exists for when somebody asks "can you send something over". */}
        <section className="mb-8">
          <p className="eyebrow mb-3 text-slate">Ready to send</p>
          <div className="inset-group card-glass">
            <Link
              href={`/clients/${client.id}/one-pager`}
              className="flex items-start gap-3 px-4 py-3.5 hover:bg-paper"
            >
              <IconLineageDoc size={20} className="mt-0.5 shrink-0 text-indigo" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">One-pager</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                  Built from what is on this page. Opens print-ready, so the
                  browser saves it as a PDF.
                </span>
              </span>
            </Link>
            {deckUrl ? (
              <a
                href={deckUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-paper"
              >
                <IconLayers size={20} className="mt-0.5 shrink-0 text-indigo" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">Pitch deck</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                    The Stride deck, opened in a new tab.
                  </span>
                </span>
              </a>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3.5">
                <IconLayers size={20} className="mt-0.5 shrink-0 text-mute" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate">Pitch deck</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                    Not wired up. The deck is its own app: publish it and set
                    STRIDE_DECK_URL, and it appears here.
                  </span>
                </span>
              </div>
            )}
          </div>
        </section>

        <section>
          <p className="eyebrow mb-3 text-slate">History</p>
          <form onSubmit={logTouch} className="mb-4 flex gap-2">
            <input
              value={touch}
              onChange={(e) => setTouch(e.target.value)}
              placeholder="What just happened"
              className="flex-1 rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo"
            />
            <button
              type="submit"
              className="rounded-input border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-midnight"
            >
              Log it.
            </button>
          </form>

          {client.touches.length === 0 ? (
            <p className="text-[14px] text-slate">
              Nothing logged yet. Every call and reply you note here shows up on
              the calendar.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {client.touches.map((t) => (
                <li key={t.id} className="flex items-start gap-3">
                  <IconTime size={16} className="mt-1 shrink-0 text-mute" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-snug text-ink">{t.note}</span>
                    <span className="mt-0.5 block text-[12px] text-mute">
                      {new Date(t.at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {t.who && ` · ${t.who}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
