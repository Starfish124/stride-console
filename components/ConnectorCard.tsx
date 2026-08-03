"use client";

// The in-house connection, git half: register the client's repo once, then
// clone it into a project. The token or key goes in here and never comes
// back out — the list only ever says a key is in place.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Glyph } from "@/components/icons";

interface ConnectorView {
  id: string;
  kind: string;
  label: string;
  repoUrl?: string;
  auth?: string;
  hasSecret?: boolean;
}

export function ConnectorCard({
  clientId,
  connectors,
}: {
  clientId: string;
  connectors: ConnectorView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [auth, setAuth] = useState<"pat" | "sshKey">("pat");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function create() {
    setBusy("save");
    setError(null);
    const res = await fetch("/api/workspace/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kind: "git", label, repoUrl, auth, secret }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "The connector could not be saved.");
      return;
    }
    setOpen(false);
    setLabel("");
    setRepoUrl("");
    setSecret("");
    router.refresh();
  }

  async function clone(connectorId: string, name: string) {
    setBusy(connectorId);
    setError(null);
    setNotice("Cloning… a first clone can take a few minutes.");
    const res = await fetch("/api/workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kind: "repo", connectorId, name }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    setNotice(null);
    if (!res.ok) {
      setError(body.error ?? "The clone failed.");
      return;
    }
    router.push(`/clients/${clientId}/workspace?p=${body.id}`);
    router.refresh();
  }

  async function remove(connectorId: string) {
    if (!confirm("Remove this connector and its key?")) return;
    await fetch(`/api/workspace/connectors?id=${connectorId}`, { method: "DELETE" });
    router.refresh();
  }

  const gitConnectors = connectors.filter((c) => c.kind === "git");

  return (
    <div className="rounded-card border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow flex items-center gap-2 text-slate">
          <Glyph name="IconKey" size={14} /> Client repos
        </p>
        <button
          type="button"
          className="eyebrow text-indigo pressable"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "Add"}
        </button>
      </div>

      {gitConnectors.length === 0 && !open && (
        <p className="mt-3 text-sm text-mute">
          No repo access yet. Add the client&apos;s repo and a token or deploy key.
        </p>
      )}

      {gitConnectors.length > 0 && (
        <ul className="inset-group mt-3">
          {gitConnectors.map((c) => (
            <li key={c.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{c.label}</p>
                <p className="truncate text-xs text-mute">{c.repoUrl}</p>
              </div>
              <button
                type="button"
                disabled={busy === c.id}
                className="eyebrow text-indigo pressable disabled:text-mute"
                onClick={() => clone(c.id, c.label)}
              >
                {busy === c.id ? "Cloning…" : "Clone"}
              </button>
              <button
                type="button"
                aria-label={`Remove ${c.label}`}
                className="text-mute hover:text-amber"
                onClick={() => remove(c.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name, e.g. Main repo"
            className="w-full rounded-input border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute"
          />
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/client/repo.git"
            className="w-full rounded-input border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute"
          />
          <select
            value={auth}
            onChange={(e) => setAuth(e.target.value === "sshKey" ? "sshKey" : "pat")}
            className="w-full rounded-input border border-line bg-white px-3 py-1.5 text-sm text-ink"
          >
            <option value="pat">Access token (https)</option>
            <option value="sshKey">Deploy key (ssh)</option>
          </select>
          <textarea
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={auth === "pat" ? "The token, pasted once" : "The private key, pasted once"}
            rows={auth === "pat" ? 1 : 4}
            className="w-full rounded-input border border-line px-3 py-1.5 font-mono text-xs text-ink placeholder:text-mute"
          />
          <button
            type="submit"
            disabled={busy === "save" || !label.trim() || !repoUrl.trim() || !secret.trim()}
            className="rounded-input bg-indigo px-4 py-1.5 text-sm text-white pressable disabled:bg-mute"
          >
            {busy === "save" ? "Saving…" : "Save connector"}
          </button>
        </form>
      )}

      {notice && <p className="mt-2 text-sm text-slate">{notice}</p>}
      {error && <p className="mt-2 text-sm text-amber">{error}</p>}
    </div>
  );
}
