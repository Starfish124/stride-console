"use client";

// Connect a founder's Mac to the graph. The token appears once, inside the
// command they paste on that machine, and never again.

import { useEffect, useState } from "react";
import { Glyph } from "@/components/icons";

interface DeviceView {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt?: string;
  sessions: number;
  connected: boolean;
}

export function GraphDevices() {
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch("/api/graph/devices", { cache: "no-store" });
    if (res.ok) setDevices(await res.json());
  }

  useEffect(() => {
    let live = true;
    // Fetch-on-mount: the setState happens after an await.
    void fetch("/api/graph/devices", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (live) setDevices(list);
      });
    return () => {
      live = false;
    };
  }, []);

  async function connect() {
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/graph/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "The machine could not be added.");
      return;
    }
    setCommand(body.command);
    setLabel("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Disconnect this machine? Its token stops working.")) return;
    await fetch(`/api/graph/devices?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="eyebrow flex items-center gap-2 text-slate">
        <Glyph name="IconTeam" size={14} /> Machines feeding the graph
      </p>
      <p className="mt-2 text-xs text-slate">
        Each machine gets its own token, so a session can be registered without
        sharing the console password. Revoking one leaves the others alone.
      </p>

      {devices.length > 0 && (
        <ul className="inset-group mt-3">
          {devices.map((device) => (
            <li key={device.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  device.connected ? "bg-lime" : "bg-line"
                }`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{device.label}</span>
                <span className="tabular block truncate text-xs text-mute">
                  {device.connected
                    ? `${device.sessions} session${device.sessions === 1 ? "" : "s"} · last ${device.lastSeenAt?.slice(0, 10)}`
                    : "waiting for its first session"}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Disconnect ${device.label}`}
                className="text-mute hover:text-amber"
                onClick={() => remove(device.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Whose machine, e.g. Jort's Mac"
          className="flex-1 rounded-input border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={busy || !label.trim()}
          className="rounded-input bg-indigo px-4 py-1.5 text-sm text-white pressable disabled:bg-mute"
        >
          {busy ? "Adding…" : "Connect"}
        </button>
      </form>

      {command && (
        <div className="mt-3 rounded-input border border-indigo/40 bg-indigo-tint/40 p-3">
          <p className="text-sm text-ink">
            Send this one line. They paste it into Terminal on that Mac, once.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-input bg-white px-3 py-2 font-mono text-xs text-ink">
            {command}
          </pre>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="eyebrow text-indigo pressable"
              onClick={() => {
                navigator.clipboard?.writeText(command);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="eyebrow text-mute hover:text-ink"
              onClick={() => {
                setCommand(null);
                setCopied(false);
              }}
            >
              Done
            </button>
          </div>
          <p className="mt-2 text-xs text-mute">
            The token is in that line and is shown only now. Lost it? Disconnect the
            machine and connect it again.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-amber">{error}</p>}
    </div>
  );
}
