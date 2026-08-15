"use client";

// The deliverables board: status, checklist, dependencies. Optimistic where a
// tick should feel instant, refresh-after-write where structure changes.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FOUNDERS } from "@/lib/auth";
import type { Deliverable, DeliverableStatus } from "@/lib/build/deliverables";

const NEXT_STATUS: Record<DeliverableStatus, DeliverableStatus> = {
  todo: "doing",
  doing: "blocked",
  blocked: "done",
  done: "todo",
};

const STATUS_TONE: Record<DeliverableStatus, string> = {
  todo: "bg-ink/5 text-slate dark:bg-white/10",
  doing: "bg-indigo/15 text-indigo",
  blocked: "bg-amber/15 text-amber",
  done: "bg-lime/15 text-lime",
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/build/deliverables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

function Card({ d, all }: { d: Deliverable; all: Deliverable[] }) {
  const router = useRouter();
  const [checklist, setChecklist] = useState(d.checklist);
  const [newItem, setNewItem] = useState("");
  const done = checklist.filter((i) => i.done).length;
  const depTitles = d.deps
    .map((id) => all.find((x) => x.id === id)?.title)
    .filter(Boolean) as string[];

  async function tick(itemId: string, on: boolean) {
    setChecklist(checklist.map((i) => (i.id === itemId ? { ...i, done: on } : i)));
    if (!(await post({ action: "tick", id: d.id, itemId, on }))) setChecklist(checklist);
  }

  async function cycleStatus() {
    await post({ action: "update", id: d.id, status: NEXT_STATUS[d.status] });
    router.refresh();
  }

  async function addItem() {
    const label = newItem.trim();
    if (!label) return;
    setNewItem("");
    await post({ action: "addItem", id: d.id, label });
    router.refresh();
  }

  async function remove() {
    await post({ action: "remove", id: d.id });
    router.refresh();
  }

  return (
    <details className="rounded-card border border-line bg-white p-4 dark:bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void cycleStatus();
          }}
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[d.status]}`}
        >
          {d.status}
        </button>
        <span className={`flex-1 text-sm font-medium ${d.status === "done" ? "text-slate line-through" : "text-ink"}`}>
          {d.title}
        </span>
        <span className="eyebrow text-slate">
          {done}/{checklist.length}
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
        {(d.owner || d.due || depTitles.length > 0) && (
          <p className="text-xs text-slate">
            {d.owner && <span>{d.owner} · </span>}
            {d.due && <span>due {d.due} · </span>}
            {depTitles.length > 0 && <span>after: {depTitles.join(", ")}</span>}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {checklist.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`${d.id}-${i.id}`}
                checked={i.done}
                onChange={(e) => void tick(i.id, e.target.checked)}
                className="size-4 accent-indigo"
              />
              <label
                htmlFor={`${d.id}-${i.id}`}
                className={`flex-1 text-sm ${i.done ? "text-slate line-through" : "text-ink"}`}
              >
                {i.label}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addItem()}
            placeholder="Add a step…"
            className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 py-1 text-sm text-ink"
          />
          <button type="button" onClick={() => void addItem()} className="text-sm text-indigo">
            Add
          </button>
          <button type="button" onClick={() => void remove()} className="text-sm text-slate">
            ✕
          </button>
        </div>
      </div>
    </details>
  );
}

export default function DeliverableBoard({ deliverables }: { deliverables: Deliverable[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [deps, setDeps] = useState<string[]>([]);

  async function add() {
    const t = title.trim();
    if (!t) return;
    await post({ action: "add", title: t, owner: owner || undefined, due: due || undefined, deps });
    setTitle("");
    setOwner("");
    setDue("");
    setDeps([]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {deliverables.map((d) => (
        <Card key={d.id} d={d} all={deliverables} />
      ))}
      <div className="rounded-card border border-dashed border-line p-4">
        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New deliverable…"
            className="rounded-md border border-line bg-transparent px-2 py-1.5 text-sm text-ink"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="rounded-md border border-line bg-transparent px-2 py-1 text-sm text-slate"
            >
              <option value="">Owner —</option>
              {FOUNDERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-md border border-line bg-transparent px-2 py-1 text-sm text-slate"
            />
            <button type="button" onClick={() => void add()} className="ml-auto text-sm font-medium text-indigo">
              Add deliverable
            </button>
          </div>
          {deliverables.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {deliverables.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    setDeps(deps.includes(d.id) ? deps.filter((x) => x !== d.id) : [...deps, d.id])
                  }
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    deps.includes(d.id)
                      ? "bg-indigo text-white"
                      : "bg-ink/5 text-slate dark:bg-white/10"
                  }`}
                >
                  after: {d.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
