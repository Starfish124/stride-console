"use client";

import { useState } from "react";

export function PitchForm() {
  const [name, setName] = useState("");
  const [startup, setStartup] = useState("");
  const [idea, setIdea] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(undefined);
    const res = await fetch("/api/pitch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startup, idea }),
    });
    if (res.ok) {
      setState("done");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? "That failed. Try again.");
    setState("idle");
  }

  if (state === "done") {
    return (
      <div className="rounded-card border border-line bg-white p-8">
        <p className="eyebrow text-indigo">You are in</p>
        <h2 className="display mt-3 text-[22px] text-ink">
          Your minute is reserved.
        </h2>
        <p className="mt-2 text-sm text-slate">
          We read every idea before the night and draw the pitch order from a
          hat. Practice out loud once: 60 seconds is more room than it sounds.
        </p>
      </div>
    );
  }

  const field =
    "rounded-input border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-slate/60 focus:border-indigo";

  return (
    <form onSubmit={submit} className="rounded-card border border-line bg-white p-8">
      {error ? (
        <p className="mb-4 rounded-input border border-indigo bg-indigo-tint px-4 py-2 text-sm text-indigo-deep">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">Your startup</span>
          <input value={startup} onChange={(e) => setStartup(e.target.value)} required maxLength={200} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-slate">The idea, in one line</span>
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            required
            maxLength={200}
            placeholder="What you do, for whom, in one breath."
            className={field}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={state === "busy"}
        className="mt-5 w-full rounded-input bg-indigo px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-deep disabled:opacity-60"
      >
        {state === "busy" ? "Reserving your minute." : "Claim your minute."}
      </button>
    </form>
  );
}
