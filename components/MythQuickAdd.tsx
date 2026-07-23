"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MythQuickAdd() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

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
      router.refresh();
    }
  }

  return (
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
  );
}
