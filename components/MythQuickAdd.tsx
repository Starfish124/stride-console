"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Myth } from "@/lib/types";

export function MythQuickAdd() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  // The unused bank, so what is waiting to be written is visible — and a myth
  // that turned out to be nonsense can be taken back out.
  const [bank, setBank] = useState<Myth[]>([]);

  async function load() {
    try {
      const res = await fetch("/api/myths");
      if (res.ok) setBank(((await res.json()) as Myth[]).filter((m) => !m.used));
    } catch {
      // the next add or visit refreshes it
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const res = await fetch("/api/myths", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });
    if (res.ok) {
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void load();
      router.refresh();
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/myths?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setBank((b) => b.filter((m) => m.id !== id));
      router.refresh();
    }
  }

  return (
    <div>
      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'e.g. "You need perfect data before AI is useful"'}
          className="flex-1 rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo"
        />
        <button
          type="submit"
          className="rounded-input border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-midnight"
        >
          {saved ? "Saved." : "Add a myth."}
        </button>
      </form>
      {bank.length > 0 && (
        <ul className="mt-3 space-y-1">
          {bank.map((m) => (
            <li key={m.id} className="flex items-start gap-2 text-sm text-slate">
              <span className="min-w-0 flex-1">“{m.text}”</span>
              <button
                type="button"
                title="Remove from the bank"
                onClick={() => void remove(m.id)}
                className="pressable shrink-0 rounded px-1.5 text-mute hover:text-amber"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
