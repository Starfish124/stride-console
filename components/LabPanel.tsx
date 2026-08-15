"use client";

// The lab's controls: make a sandbox, see what's up, destroy it.

import { useEffect, useState } from "react";

interface SandboxView {
  id: string;
  name: string;
  image: string;
  port?: number;
  createdAt: string;
  dir: string;
  running: boolean;
  shell: string;
}

export function LabPanel() {
  const [sandboxes, setSandboxes] = useState<SandboxView[] | null>(null);
  const [name, setName] = useState("");
  const [image, setImage] = useState("alpine:latest");
  const [port, setPort] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/lab", { cache: "no-store" });
    const body = await res.json().catch(() => ({ sandboxes: [] }));
    setSandboxes(body.sandboxes ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        image,
        port: port.trim() ? Number(port) : undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not create the sandbox.");
      return;
    }
    setName("");
    setPort("");
    refresh();
  }

  async function destroy(sandbox: SandboxView) {
    if (!window.confirm(`Destroy "${sandbox.name}"? The VM and its folder are gone for good.`)) {
      return;
    }
    await fetch(`/api/lab/${sandbox.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section className="mt-8">
      <form
        className="rounded-card border border-line bg-white p-4 card-glass"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <p className="eyebrow text-slate">New sandbox</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What is the experiment?"
            className="flex-1 rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute"
          />
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="Image (alpine:latest)"
            className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute sm:w-44"
          />
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="Port"
            inputMode="numeric"
            className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute sm:w-24"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-input bg-indigo px-4 py-2 text-sm text-white pressable disabled:bg-mute"
          >
            {busy ? "Starting…" : "Create"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-amber">{error}</p>}
        <p className="mt-2 text-[12px] text-mute">
          A tiny Linux VM with its own folder mounted at /work. First use of an image pulls it —
          give it a minute. 2GB memory, 2 CPUs, nothing outside its folder.
        </p>
      </form>

      {sandboxes && sandboxes.length === 0 && (
        <p className="mt-4 text-sm text-mute">No sandboxes. The lab is clean.</p>
      )}
      {sandboxes && sandboxes.length > 0 && (
        <div className="mt-4 inset-group">
          {sandboxes.map((s) => (
            <div key={s.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[14px] font-semibold text-ink">{s.name}</p>
                <span className={`shrink-0 text-[12px] ${s.running ? "text-slate" : "text-amber"}`}>
                  {s.running ? "running" : "stopped"}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-mute">
                {s.image}
                {s.port ? ` · localhost:${s.port}` : ""} · {s.createdAt.slice(0, 10)}
              </p>
              <p className="tabular mt-1 break-all text-[12px] text-mute">{s.dir}</p>
              <div className="mt-2 flex items-center gap-3">
                <code className="tabular flex-1 truncate rounded-input bg-paper px-2 py-1 text-[12px] text-slate">
                  {s.shell}
                </code>
                <button
                  type="button"
                  onClick={() => destroy(s)}
                  className="shrink-0 text-[13px] text-amber pressable"
                >
                  Destroy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
