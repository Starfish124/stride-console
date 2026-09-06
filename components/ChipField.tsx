"use client";

import { useState } from "react";

/**
 * A list of values as chips, the way a prospecting tool does it.
 *
 * This replaces a comma-separated text input, which is the least inviting
 * control in the console: it hides how many values there are, gives no way to
 * remove one without editing a string, and turns a typo three items back into a
 * whole-field re-read. A chip you can see and remove is the difference between
 * a form and an instrument.
 *
 * Enter and comma both commit, because people type both. Backspace on an empty
 * box removes the last chip, which is the behaviour every tag input has and the
 * one nobody has to be taught.
 */
export function ChipField({
  label,
  hint,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const next = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .filter((v) => !values.some((existing) => existing.toLowerCase() === v.toLowerCase()));
    if (next.length) onChange([...values, ...next]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow text-slate">{label}</span>
        <span className="num text-[11px] text-mute">{values.length}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-input border border-line bg-white p-2">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pl-2.5 pr-1.5 text-[13px] text-ink"
          >
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="pressable flex size-5 items-center justify-center rounded-full text-mute hover:bg-line hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}

        <input
          value={draft}
          onChange={(e) => {
            // A pasted "a, b, c" commits straight away rather than sitting
            // there as one long chip.
            if (e.target.value.includes(",")) commit(e.target.value);
            else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={values.length === 0 ? placeholder : "Add another"}
          className="min-h-[30px] min-w-[9ch] flex-1 bg-transparent px-1 text-[14px] text-ink outline-none placeholder:text-mute"
        />
      </div>

      {hint ? <span className="text-[11px] leading-snug text-mute">{hint}</span> : null}
    </div>
  );
}
