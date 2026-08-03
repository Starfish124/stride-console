"use client";

// The in-house connection, server half. This card is deliberately loud:
// what runs here runs on the client's real server, so the host has to be
// typed back every single time, and the badge says plainly whether the
// machine is armed or dry.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Glyph } from "@/components/icons";

interface ConnectorView {
  id: string;
  kind: string;
  label: string;
  host?: string;
  username?: string;
  hasSecret?: boolean;
}

interface AuditLine {
  id: string;
  phase: string;
  command: string;
  dryRun: boolean;
  confirmedBy: string;
  at: string;
  exitCode?: number;
}

/** Mode badge + audit tail, outside the component so nothing needs memoizing. */
async function fetchMeta(connectorId?: string) {
  const [modeRes, logRes] = await Promise.all([
    fetch("/api/workspace/ssh/run", { cache: "no-store" }),
    connectorId
      ? fetch(`/api/workspace/ssh/log?connectorId=${connectorId}`, { cache: "no-store" })
      : Promise.resolve(null),
  ]);
  return {
    mode: modeRes.ok ? ((await modeRes.json()).mode as string) : null,
    log: logRes?.ok ? ((await logRes.json()) as AuditLine[]) : [],
  };
}

export function SshConsole({
  clientId,
  connectors,
}: {
  clientId: string;
  connectors: ConnectorView[];
}) {
  const router = useRouter();
  const sshConnectors = connectors.filter((c) => c.kind === "ssh");
  const [selectedId, setSelectedId] = useState(sshConnectors[0]?.id ?? "");
  const selected = sshConnectors.find((c) => c.id === selectedId) ?? sshConnectors[0];

  const [mode, setMode] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [command, setCommand] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<AuditLine[]>([]);

  const activeId = selected?.id;
  useEffect(() => {
    let live = true;
    // Fetch-on-mount: the setStates happen after an await, never
    // synchronously during the effect.
    void fetchMeta(activeId).then((meta) => {
      if (!live) return;
      setMode(meta.mode);
      setLog(meta.log);
    });
    return () => {
      live = false;
    };
  }, [activeId]);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workspace/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kind: "ssh", label, host, username, secret }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "The connector could not be saved.");
      return;
    }
    setOpen(false);
    setLabel("");
    setHost("");
    setUsername("");
    setSecret("");
    router.refresh();
  }

  async function run() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    setOutput(null);
    const res = await fetch("/api/workspace/ssh/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: selected.id, command, confirm }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setConfirm(""); // typed again every time, never sticky
    if (!res.ok) {
      setError(body.error ?? "The run was refused.");
      return;
    }
    setOutput(
      body.dryRun
        ? body.output
        : `exit ${body.exitCode}\n${body.output || "(no output)"}`,
    );
    setCommand("");
    const meta = await fetchMeta(selected.id);
    setMode(meta.mode);
    setLog(meta.log);
  }

  return (
    <div className="rounded-card border border-amber/60 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow flex items-center gap-2 text-slate">
          <Glyph name="IconGuardrail" size={14} /> Their servers
        </p>
        <span
          className={`eyebrow rounded-input px-2 py-0.5 ${
            mode === "live" ? "bg-amber/20 text-amber" : "bg-paper text-mute"
          }`}
        >
          {mode === "live" ? "LIVE" : mode === null ? "…" : "DRY"}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate">
        In-house connection — what runs here runs on the client&apos;s real server.
      </p>

      {sshConnectors.length === 0 && !open && (
        <p className="mt-3 text-sm text-mute">No server access set up.</p>
      )}

      {sshConnectors.length > 0 && (
        <div className="mt-3 space-y-2">
          {sshConnectors.length > 1 && (
            <select
              value={selected?.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-input border border-line bg-white px-3 py-1.5 text-sm text-ink"
            >
              {sshConnectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {c.username}@{c.host}
                </option>
              ))}
            </select>
          )}
          {sshConnectors.length === 1 && selected && (
            <p className="text-sm text-ink">
              {selected.label} · <span className="tabular">{selected.username}@{selected.host}</span>
            </p>
          )}
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="The command to run"
            className="w-full rounded-input border border-line px-3 py-1.5 font-mono text-xs text-ink placeholder:text-mute"
          />
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={selected ? `Type ${selected.host} to confirm` : ""}
            className="w-full rounded-input border border-amber/60 px-3 py-1.5 text-sm text-ink placeholder:text-mute"
          />
          <button
            type="button"
            onClick={run}
            disabled={busy || !command.trim() || !confirm.trim()}
            className="rounded-input bg-amber px-4 py-1.5 text-sm text-white pressable disabled:bg-mute"
          >
            {busy ? "Running…" : mode === "live" ? "Run on their server" : "Run (dry)"}
          </button>
        </div>
      )}

      {output && (
        <pre className="mt-3 max-h-60 overflow-auto rounded-input bg-paper px-3 py-2 text-xs text-ink">
          {output}
        </pre>
      )}
      {error && <p className="mt-2 text-sm text-amber">{error}</p>}

      <button
        type="button"
        className="eyebrow mt-3 text-indigo pressable"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close" : "Add server access"}
      </button>

      {open && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name, e.g. Production API"
            className="w-full rounded-input border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute"
          />
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="host, e.g. api.client.nl or host:2222"
            className="w-full rounded-input border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute"
          />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="w-full rounded-input border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute"
          />
          <textarea
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="The private key, pasted once"
            rows={4}
            className="w-full rounded-input border border-line px-3 py-1.5 font-mono text-xs text-ink placeholder:text-mute"
          />
          <button
            type="submit"
            disabled={busy || !label.trim() || !host.trim() || !username.trim() || !secret.trim()}
            className="rounded-input bg-indigo px-4 py-1.5 text-sm text-white pressable disabled:bg-mute"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {log.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-2 text-slate">Every run, on the record</p>
          <ul className="space-y-1">
            {log
              .filter((l) => l.phase === "end")
              .slice(0, 6)
              .map((l) => (
                <li key={`${l.id}-${l.phase}`} className="truncate text-xs text-mute">
                  <span className="tabular">{l.at.slice(0, 16).replace("T", " ")}</span>
                  {" · "}
                  {l.confirmedBy}
                  {" · "}
                  <span className="font-mono">{l.command}</span>
                  {" · "}
                  {l.dryRun ? "dry" : `exit ${l.exitCode}`}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
