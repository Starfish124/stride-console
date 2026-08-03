"use client";

// Tooling for a project: tick the skills and agents it should carry, and
// every Claude run in it starts already knowing them.

import { useEffect, useState } from "react";
import { Glyph } from "@/components/icons";

interface LibraryItem {
  name: string;
  kind: "skill" | "agent";
  description: string;
}

export function EquipCard({ projectId }: { projectId: string }) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    // Fetch-on-mount: the setStates happen after an await.
    void fetch(`/api/workspace/projects/${projectId}/equip`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { library: [], equipped: { skills: [], agents: [] } }))
      .then((body) => {
        if (!live) return;
        setLibrary(body.library);
        setChecked(new Set([...body.equipped.skills, ...body.equipped.agents]));
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const want = {
      skills: library.filter((i) => i.kind === "skill" && checked.has(i.name)).map((i) => i.name),
      agents: library.filter((i) => i.kind === "agent" && checked.has(i.name)).map((i) => i.name),
    };
    const res = await fetch(`/api/workspace/projects/${projectId}/equip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(want),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "The tooling could not be installed.");
      return;
    }
    setSaved(true);
  }

  function toggle(name: string) {
    setSaved(false);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const skills = library.filter((i) => i.kind === "skill");
  const agents = library.filter((i) => i.kind === "agent");

  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="eyebrow flex items-center gap-2 text-slate">
        <Glyph name="IconLayers" size={14} /> Tooling
      </p>
      <p className="mt-2 text-xs text-slate">
        Skills and agents this project&apos;s runs carry. Drop new packs in{" "}
        <span className="font-mono">library/skills</span> to grow the shelf.
      </p>

      {[
        { label: "Skills", items: skills },
        { label: "Agents", items: agents },
      ].map(
        (group) =>
          group.items.length > 0 && (
            <div key={group.label} className="mt-3">
              <p className="eyebrow text-mute">{group.label}</p>
              <ul className="mt-1 space-y-1">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <label className="flex items-start gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={checked.has(item.name)}
                        onChange={() => toggle(item.name)}
                        className="mt-0.5"
                      />
                      <span>
                        {item.name}
                        {item.description && (
                          <span className="block text-xs text-mute">{item.description}</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-input bg-indigo px-4 py-1.5 text-sm text-white pressable disabled:bg-mute"
        >
          {busy ? "Installing…" : "Equip"}
        </button>
        {saved && <span className="text-sm text-slate">Installed.</span>}
      </div>
      {error && <p className="mt-2 text-sm text-amber">{error}</p>}
    </div>
  );
}
