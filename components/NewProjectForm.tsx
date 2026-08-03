"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, name }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "The project could not be created.");
      return;
    }
    setName("");
    router.push(`/clients/${clientId}/workspace?p=${body.id}`);
    router.refresh();
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project"
        className="rounded-input border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-mute"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="eyebrow text-indigo pressable disabled:text-mute"
      >
        {busy ? "Creating…" : "Create"}
      </button>
      {error && <span className="text-sm text-amber">{error}</span>}
    </form>
  );
}
