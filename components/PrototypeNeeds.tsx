"use client";

// The "what's needed to advance it" list on a prototype card — optimistic
// ticks, add-a-need inline.

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PrototypeNeed } from "@/lib/build/prototypes";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/build/prototypes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export default function PrototypeNeeds({ id, needs: initial }: { id: string; needs: PrototypeNeed[] }) {
  const router = useRouter();
  const [needs, setNeeds] = useState(initial);
  const [label, setLabel] = useState("");
  const open = needs.filter((n) => !n.done).length;

  async function tick(needId: string, on: boolean) {
    setNeeds(needs.map((n) => (n.id === needId ? { ...n, done: on } : n)));
    if (!(await post({ action: "tick", id, needId, on }))) setNeeds(needs);
  }

  async function add() {
    const l = label.trim();
    if (!l) return;
    setLabel("");
    await post({ action: "addNeed", id, label: l });
    router.refresh();
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-slate">Needed to advance</p>
        <span className="eyebrow text-indigo">{open} open</span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {needs.map((n) => (
          <li key={n.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              id={`${id}-${n.id}`}
              checked={n.done}
              onChange={(e) => void tick(n.id, e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-indigo"
            />
            <label
              htmlFor={`${id}-${n.id}`}
              className={`text-sm ${n.done ? "text-slate line-through" : "text-ink"}`}
            >
              {n.label}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="Add a need…"
          className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 py-1 text-sm text-ink"
        />
        <button type="button" onClick={() => void add()} className="text-sm text-indigo">
          Add
        </button>
      </div>
    </div>
  );
}
