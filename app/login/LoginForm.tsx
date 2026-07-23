"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FOUNDERS = ["Founder A", "Founder B"];

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [founder, setFounder] = useState(FOUNDERS[0]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, founder }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Wrong password.");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-card border border-line bg-white p-6"
    >
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow text-slate">Shared password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-input border border-line bg-paper px-3 py-2 text-ink outline-none focus:border-indigo"
          autoFocus
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow text-slate">Who are you</span>
        <div className="flex gap-2">
          {FOUNDERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFounder(f)}
              className={`flex-1 rounded-input border px-3 py-2 text-sm font-semibold ${
                founder === f
                  ? "border-indigo bg-indigo-tint text-indigo"
                  : "border-line bg-white text-slate hover:border-slate"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-indigo-deep">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-input bg-indigo px-4 py-2.5 font-semibold text-white hover:bg-indigo-deep disabled:opacity-60"
      >
        {busy ? "Checking." : "Enter the console."}
      </button>
    </form>
  );
}
