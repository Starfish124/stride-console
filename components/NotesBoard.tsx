"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANE_LABELS, NOTE_LANES, type Note, type NoteLane } from "@/lib/types";
import { IconBranch } from "@/components/icons";

/**
 * The shared board. Both founders, one list.
 *
 * Four lanes and a text box. It is deliberately not a task tracker: no
 * assignees, no priorities, no due dates, because the two people using it sit
 * in the same company and can just ask each other. What it does have is a lane
 * for "building", which is the only state where knowing who is on it saves a
 * duplicated afternoon — so notes carry who wrote them and nothing else.
 */

const LANE_TONE: Record<NoteLane, string> = {
  idea: "text-violet",
  todo: "text-indigo",
  doing: "text-amber",
  done: "text-lime",
};

export function NotesBoard({ notes }: { notes: Note[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [lane, setLane] = useState<NoteLane>("idea");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lane, area }),
    });
    setBusy(false);
    if (!res.ok) return;
    setText("");
    setArea("");
    router.refresh();
  }

  async function move(note: Note, to: NoteLane) {
    await fetch("/api/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: note.id, lane: to }),
    });
    router.refresh();
  }

  async function remove(note: Note) {
    await fetch(`/api/notes?id=${encodeURIComponent(note.id)}`, { method: "DELETE" });
    router.refresh();
  }

  const field =
    "rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo";

  return (
    <div>
      <form
        onSubmit={add}
        className="card-glass mb-10 rounded-card border border-line bg-white p-5"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Something one of you thought of"
          className={`${field} w-full resize-y`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={lane}
            onChange={(e) => setLane(e.target.value as NoteLane)}
            className={field}
            aria-label="Which lane"
          >
            {NOTE_LANES.map((l) => (
              <option key={l} value={l}>
                {LANE_LABELS[l]}
              </option>
            ))}
          </select>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="What it is about, optional"
            className={`${field} flex-1 min-w-[180px]`}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-input border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-midnight disabled:opacity-50"
          >
            {busy ? "Saving." : "Add it."}
          </button>
        </div>
      </form>

      {notes.length === 0 && (
        <p className="card-glass flex items-center gap-2.5 rounded-card border border-line bg-white px-5 py-4 text-[15px] text-slate">
          <IconBranch size={18} className="shrink-0 text-mute" />
          Empty board. Whatever either of you thinks of goes here.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        {NOTE_LANES.map((l) => {
          const inLane = notes.filter((n) => n.lane === l);
          return (
            <section key={l}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h2 className="display text-[18px] text-ink">{LANE_LABELS[l]}</h2>
                <span className={`tabular text-[13px] ${LANE_TONE[l]}`}>{inLane.length}</span>
              </div>
              <div className={`slant-rule mb-3.5 w-8 ${LANE_TONE[l]}`} />

              <ul className="flex flex-col gap-2.5">
                {inLane.map((n) => (
                  <li
                    key={n.id}
                    className="card-glass rounded-card border border-line bg-white px-4 pb-2 pt-3.5"
                  >
                    <p className="whitespace-pre-line text-[14px] leading-snug text-ink">
                      {n.text}
                    </p>
                    <p className="mt-1.5 text-[12px] text-mute">
                      {n.area && `${n.area} · `}
                      {n.by ?? "someone"} ·{" "}
                      {new Date(n.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <div className="mt-2 flex items-center gap-1 border-t border-line pt-1.5">
                      {NOTE_LANES.filter((x) => x !== l).map((x) => (
                        <button
                          key={x}
                          type="button"
                          onClick={() => move(n, x)}
                          title={`Move to ${LANE_LABELS[x]}`}
                          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-mute hover:bg-indigo-tint hover:text-indigo"
                        >
                          {LANE_LABELS[x]}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => remove(n)}
                        title="Delete"
                        className="ml-auto rounded px-1.5 py-0.5 text-[11px] font-semibold text-mute hover:text-amber"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
