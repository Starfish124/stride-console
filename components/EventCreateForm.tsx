"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Working } from "@/components/Loader";

export function EventCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("1 Min AI Pitch");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [capacity, setCapacity] = useState("60");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, date, venue, capacity: Number(capacity) }),
    });
    const data = (await res.json()) as { id?: string; error?: string };
    setBusy(false);
    if (res.ok && data.id) {
      router.refresh();
      setVenue("");
      setDate("");
    } else {
      setError(data.error ?? "That failed.");
    }
  }

  const field =
    "rounded-input border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo";

  return (
    <form onSubmit={create} className="card-glass rounded-card border border-line bg-white p-6">
      <p className="eyebrow text-slate">New event</p>
      <p className="mt-2 text-sm text-slate">
        Set the date and the T-6-weeks checklist writes itself.
      </p>
      {error ? <p className="mt-3 text-xs text-indigo-deep">{error}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">Venue</span>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="De Loods, Amsterdam"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">Capacity</span>
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-input bg-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-deep disabled:opacity-60"
      >
        {busy ? <Working onDark>Creating.</Working> : "Create the event."}
      </button>
    </form>
  );
}
