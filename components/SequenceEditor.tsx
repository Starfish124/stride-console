"use client";

import { useState } from "react";
import type { LintResult } from "@/lib/types";

type Kind = "connect" | "message" | "inmail";

interface Step {
  id?: string;
  kind: Kind;
  waitDays: number;
  body: string;
}

interface Verdict {
  steps: Array<{ id: string; lint: LintResult; limit: { hard: number; aim: number; label: string } }>;
  errors: number;
  warns: number;
}

const KIND_LABEL: Record<Kind, string> = {
  connect: "Connection note",
  message: "Message",
  inmail: "InMail",
};

const BLANK: Step[] = [
  { kind: "connect", waitDays: 0, body: "" },
  { kind: "message", waitDays: 3, body: "" },
];

export function SequenceEditor({
  initial,
}: {
  initial?: { id: string; name: string; audience: string; steps: Step[] };
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [steps, setSteps] = useState<Step[]>(initial?.steps ?? BLANK);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [template, setTemplate] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [id, setId] = useState(initial?.id);

  function patch(i: number, next: Partial<Step>) {
    setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...next } : s)));
  }

  async function save() {
    setBusy(true);
    setCopied(false);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, audience, steps }),
      });
      const data = await res.json();
      if (data.sequence) {
        setId(data.sequence.id);
        setVerdict(data.verdict);
        setTemplate(data.template ?? "");
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyTemplate() {
    await navigator.clipboard.writeText(template);
    setCopied(true);
  }

  const input =
    "w-full card-glass rounded-input border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-slate/60 focus:border-indigo";

  return (
    <div className="flex flex-col gap-5">
      <div className="card-glass rounded-card border border-line bg-white p-5">
        <label className="eyebrow text-slate" htmlFor="seq-name">
          Sequence
        </label>
        <input
          id="seq-name"
          className={`${input} mt-2`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dutch MKB ops leads, Q3"
        />
        <label className="eyebrow mt-4 block text-slate" htmlFor="seq-audience">
          Who this is for
        </label>
        <input
          id="seq-audience"
          className={`${input} mt-2`}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="Ops leads at 50-500 person Dutch wholesalers"
        />
        <p className="mt-2 text-[13px] text-slate">
          One sentence. It sharpens the writing, and it is what you will check
          the copy against when you read it back.
        </p>
      </div>

      {steps.map((step, i) => {
        const stepVerdict = verdict?.steps[i];
        const count = step.body.trim().length;
        const limit = stepVerdict?.limit;
        const over = limit ? count > limit.hard : false;

        return (
          <div key={i} className="card-glass rounded-card border border-line bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow text-indigo">Step {String(i + 1).padStart(2, "0")}</span>
              <select
                aria-label={`Step ${i + 1} type`}
                className="rounded-input border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink"
                value={step.kind}
                onChange={(e) => patch(i, { kind: e.target.value as Kind })}
              >
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              {i > 0 && (
                <label className="flex items-center gap-2 text-[13px] text-slate">
                  wait
                  <input
                    type="number"
                    min={0}
                    className="tabular w-16 rounded-input border border-line bg-white px-2 py-1.5 text-[13px] text-ink"
                    value={step.waitDays}
                    onChange={(e) => patch(i, { waitDays: Number(e.target.value) })}
                  />
                  days
                </label>
              )}
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}
                  className="ml-auto text-[13px] text-slate hover:text-indigo"
                >
                  Remove
                </button>
              )}
            </div>

            <textarea
              className={`${input} mt-3 min-h-[120px] resize-y leading-relaxed`}
              value={step.body}
              onChange={(e) => patch(i, { body: e.target.value })}
              placeholder={
                i === 0
                  ? "Hi {first_name}, ..."
                  : "Following up on the note about ..."
              }
            />

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className={`tabular text-[13px] ${over ? "text-red-600" : "text-slate"}`}>
                {count}
                {limit ? ` / ${limit.hard}` : ""}
              </span>
              {i === 0 && (
                <span className="text-[13px] text-slate">
                  The cold one. Nothing gets asked for here.
                </span>
              )}
            </div>

            {stepVerdict && stepVerdict.lint.violations.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {stepVerdict.lint.violations.map((v, k) => (
                  <li
                    key={k}
                    className={`rounded-input border px-3 py-2 text-[13px] ${
                      v.severity === "error"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    <span className="eyebrow">{v.rule}</span>
                    <span className="mt-1 block">{v.fix}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setSteps((all) => [...all, { kind: "message", waitDays: 4, body: "" }])}
          className="rounded-input border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink"
        >
          Add a step
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-input bg-indigo px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Checking." : "Save and check the voice."}
        </button>
      </div>

      {verdict && (
        <div className="card-glass rounded-card border border-line bg-white p-5">
          <p className="eyebrow text-slate">Verdict</p>
          <p className="mt-2 text-[15px] text-ink">
            {verdict.errors === 0
              ? `Clean. ${verdict.warns} thing${verdict.warns === 1 ? "" : "s"} to consider.`
              : `${verdict.errors} error${verdict.errors === 1 ? "" : "s"} to fix before this goes near anyone.`}
          </p>

          {template && (
            <>
              <button
                type="button"
                onClick={copyTemplate}
                className="mt-4 rounded-input bg-ink px-4 py-2.5 text-[15px] font-semibold text-white"
              >
                {copied ? "Copied." : "Copy for Linked Helper."}
              </button>
              <p className="mt-2 text-[13px] text-slate">
                Paste each step into the matching action in Linked Helper.
                Nothing is sent from here.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
