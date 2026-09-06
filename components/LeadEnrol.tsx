"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface EnrolCandidate {
  id: string;
  name: string;
  company: string;
  role?: string;
}

/**
 * Putting a batch of people into a sequence.
 *
 * The reason is typed once and written verbatim onto every enrolment, which is
 * a real weakening of what enrol() asks for — a sentence about this person
 * specifically. It is done with eyes open: the thing a founder actually does
 * otherwise is paste the same sentence twenty times, which is the same
 * weakening with more typing and no record that it was a batch.
 *
 * So the box is never pre-filled, the count is in the button, and the screen
 * says the reason covers everyone.
 */
export function LeadEnrol({
  candidates,
  sequences,
  imported,
}: {
  candidates: EnrolCandidate[];
  sequences: { id: string; name: string; shape: string }[];
  /** How many people are in the client book at all, to tell the two empties apart. */
  imported: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [take, setTake] = useState(Math.min(10, candidates.length));
  const [note, setNote] = useState("");

  if (sequences.length === 0) {
    return (
      <p className="text-[15px] text-slate">
        No LinkedIn sequence written yet. Write one on the outreach page and this can send to it.
      </p>
    );
  }
  if (candidates.length === 0) {
    // Two very different situations, and saying the wrong one sends a founder
    // hunting for a problem that is not there. An empty client book means the
    // import above has not been run; a full one means everybody is already
    // being written to.
    return (
      <p className="text-[15px] text-slate">
        {imported === 0
          ? "Nobody in the client book yet. Add them with the import just above, and they appear here."
          : "Nobody new to enrol. Everyone with a LinkedIn profile is already in a sequence, or has been through one."}
      </p>
    );
  }

  function enrol() {
    setNote("");
    startTransition(async () => {
      const res = await fetch("/api/salesnav/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: candidates.slice(0, take).map((c) => c.id),
          sequenceId,
          basis: {
            kind: "legitimate-interest",
            reason,
            source: "Apollo ICP list",
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        enrolled?: number;
        refused?: { problem: string }[];
        error?: string;
      };
      if (!res.ok) {
        setNote(json.error ?? "That did not work.");
        return;
      }
      const refused = json.refused?.length ?? 0;
      setNote(
        `${json.enrolled ?? 0} enrolled${refused ? `, ${refused} refused — ${json.refused![0].problem}` : ""}. ` +
          "The first messages appear in the queue on the next run.",
      );
      setReason("");
      router.refresh();
    });
  }

  const ready = reason.trim().length >= 20 && take > 0;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="eyebrow text-slate">Which sequence</span>
        <select
          value={sequenceId}
          onChange={(e) => setSequenceId(e.target.value)}
          className="rounded-input border border-line bg-white px-3 py-2 text-[14px] text-ink"
        >
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.shape}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-slate">
          How many<span className="ml-2 normal-case tracking-normal text-[11px]">of {candidates.length} ready</span>
        </span>
        <input
          value={take}
          inputMode="numeric"
          onChange={(e) =>
            setTake(Math.max(0, Math.min(candidates.length, Number(e.target.value.replace(/\D/g, "")) || 0)))
          }
          className="rounded-input border border-line px-3 py-2 text-[14px] text-ink"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-slate">Why these people</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="At least twenty characters, in your own words."
          className="rounded-input border border-line px-3 py-2 text-[14px] leading-snug text-ink"
        />
        <span className="text-[12px] text-slate">
          This is the lawful basis, recorded on every one of them. It covers the whole batch, not
          each person — so write what is true of all of them.
        </span>
      </label>

      <button
        type="button"
        disabled={pending || !ready}
        onClick={enrol}
        className="pressable self-start rounded-input bg-ink px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Enrolling." : `Put ${take} into this sequence`}
      </button>

      {note ? <p className="text-[14px] text-ink">{note}</p> : null}
    </div>
  );
}
