"use client";

import { useState } from "react";
import type { StrideEvent } from "@/lib/types";

export function EventChecklist({ event }: { event: StrideEvent }) {
  const [checklist, setChecklist] = useState(event.checklist);

  async function toggle(itemId: string, done: boolean) {
    setChecklist(checklist.map((i) => (i.id === itemId ? { ...i, done } : i)));
    const res = await fetch(`/api/events/${event.id}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, done }),
    });
    if (!res.ok) {
      setChecklist(checklist);
    }
  }

  const doneCount = checklist.filter((i) => i.done).length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-card border border-line bg-white p-6">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-slate">Checklist</p>
        <span className="eyebrow text-indigo">
          {doneCount}/{checklist.length}
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {checklist.map((item) => {
          const overdue = !item.done && item.due < today;
          return (
            <li key={item.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`${event.id}-${item.id}`}
                checked={item.done}
                onChange={(e) => toggle(item.id, e.target.checked)}
                className="h-4 w-4 accent-[#3D44D9]"
              />
              <label
                htmlFor={`${event.id}-${item.id}`}
                className={`flex-1 text-sm ${item.done ? "text-slate line-through" : "text-ink"}`}
              >
                {item.label}
              </label>
              <span className={`eyebrow ${overdue ? "text-indigo-deep" : "text-slate"}`}>
                {overdue ? `due ${item.due}` : item.due}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
