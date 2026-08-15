"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BLUEPRINT_KINDS,
  BLUEPRINT_KIND_LABELS,
  type Blueprint,
  type BlueprintKind,
  type Client,
} from "@/lib/types";
import { DeleteX } from "@/components/DeleteX";
import { toast } from "sonner";

/**
 * The shelf: everything built once, ready to be built again.
 *
 * Sorted by earned trust — proven before experimental, then by reuse count —
 * because the question this page answers is "what do we already know works".
 * Copy puts the payload spec on the clipboard; "used for" logs which client
 * got a copy, which is how a blueprint accumulates its track record.
 */

const KIND_TONE: Record<BlueprintKind, string> = {
  agent: "bg-indigo/10 text-indigo",
  workflow: "bg-violet/10 text-violet",
  prompt: "bg-amber/15 text-amber",
  integration: "bg-lime/15 text-lime",
};

function BlueprintCard({ bp, clients }: { bp: Blueprint; clients: Client[] }) {
  const router = useRouter();
  const [openSpec, setOpenSpec] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logging, setLogging] = useState(false);
  const [client, setClient] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);

  async function copyPayload() {
    await navigator.clipboard.writeText(bp.payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function logUse() {
    const chosen = client.trim();
    if (!chosen) return;
    const res = await fetch("/api/blueprints", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "use", id: bp.id, client: chosen }),
    });
    setSaveFailed(!res.ok);
    if (res.ok) {
      toast.success(`Logged: ${bp.name} for ${chosen}`);
      setLogging(false);
      setClient("");
      router.refresh();
    }
  }

  async function toggleStatus() {
    const res = await fetch("/api/blueprints", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: bp.id, status: bp.status === "proven" ? "experimental" : "proven" }),
    });
    setSaveFailed(!res.ok);
    if (res.ok) router.refresh();
  }

  return (
    <li className="rounded-card border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`eyebrow rounded-full px-2 py-0.5 text-[10px] ${KIND_TONE[bp.kind]}`}>
              {BLUEPRINT_KIND_LABELS[bp.kind]}
            </span>
            <h3 className="display truncate text-lg text-ink">{bp.name}</h3>
            <button
              type="button"
              onClick={() => void toggleStatus()}
              aria-pressed={bp.status === "proven"}
              aria-label={`Status ${bp.status}. Tap to flip proven/experimental.`}
              title="Tap to flip proven/experimental"
              className={`eyebrow pressable rounded-full px-2.5 py-1 text-[9px] ${
                bp.status === "proven" ? "bg-lime/20 text-ink" : "bg-line/50 text-slate"
              }`}
            >
              {bp.status}
            </button>
          </div>
          <p className="mt-1 text-sm text-slate">{bp.oneLiner}</p>
        </div>
        <DeleteX url={`/api/blueprints?id=${bp.id}`} ask={`Drop "${bp.name}" from the shelf?`} label="Remove blueprint" />
      </div>

      {saveFailed && (
        <p className="mt-2 text-sm font-semibold text-amber-deep">
          That change did not save. Check the connection and try again.
        </p>
      )}

      <div className="mt-3 grid gap-4 text-[13px] leading-relaxed sm:grid-cols-2">
        <div>
          <p className="eyebrow text-[10px] text-mute">Problem</p>
          <p className="mt-1 text-slate">{bp.problem}</p>
        </div>
        <div>
          <p className="eyebrow text-[10px] text-mute">How it works</p>
          <p className="mt-1 text-slate">{bp.solution}</p>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-1.5">
        {bp.stack.map((tool) => (
          <span key={tool} className="rounded-full border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-slate">
            {tool}
          </span>
        ))}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-[12px] text-slate">
          Built for <span className="font-semibold text-ink">{bp.builtFor || "—"}</span>
          {bp.uses.length > 0 && (
            <>
              {" "}· reused {bp.uses.length}×{" "}
              <span className="text-mute">({bp.uses.map((u) => u.client).join(", ")})</span>
            </>
          )}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenSpec((o) => !o)}
            className="pressable rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate hover:text-indigo"
          >
            {openSpec ? "Hide spec" : "Read spec"}
          </button>
          <button
            type="button"
            onClick={() => void copyPayload()}
            className="pressable rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-midnight"
          >
            {copied ? "On the clipboard" : "Copy spec"}
          </button>
          {logging ? (
            <span className="flex items-center gap-1.5">
              <input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                list={`clients-${bp.id}`}
                placeholder="Which client?"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void logUse())}
                className="w-36 rounded-input border border-line bg-white px-2 py-1.5 text-xs text-ink placeholder:text-mute focus:border-indigo/40"
              />
              <datalist id={`clients-${bp.id}`}>
                {clients.map((c) => (
                  <option key={c.id} value={c.company || c.name} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => void logUse()}
                className="pressable rounded-full bg-indigo px-3 py-1.5 text-xs font-semibold text-white"
              >
                Log
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="pressable rounded-full border border-indigo/30 bg-indigo-tint/40 px-3 py-1.5 text-xs font-semibold text-indigo"
            >
              Used for…
            </button>
          )}
        </span>
      </div>

      {openSpec && (
        <pre className="mt-3 overflow-x-auto rounded-input border border-line bg-paper p-4 font-mono text-[12px] leading-relaxed text-ink whitespace-pre-wrap">
          {bp.payload}
        </pre>
      )}
    </li>
  );
}

function NewBlueprintForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BlueprintKind>("workflow");
  const [oneLiner, setOneLiner] = useState("");
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [stack, setStack] = useState("");
  const [builtFor, setBuiltFor] = useState("");
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);

  const field =
    "w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-indigo/40";

  return (
    <form
      className="mt-4 space-y-3 rounded-card border border-line bg-white p-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (busy || !name.trim() || !oneLiner.trim() || !payload.trim()) return;
        setBusy(true);
        const res = await fetch("/api/blueprints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, kind, oneLiner, problem, solution, stack, builtFor, payload }),
        });
        setBusy(false);
        if (res.ok) {
          done();
          router.refresh();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Blueprint name" className={field} autoFocus />
        <select value={kind} onChange={(e) => setKind(e.target.value as BlueprintKind)} className={field}>
          {BLUEPRINT_KINDS.map((k) => (
            <option key={k} value={k}>
              {BLUEPRINT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <input value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} placeholder="One line: what it does" className={field} />
        <input value={builtFor} onChange={(e) => setBuiltFor(e.target.value)} placeholder="Built for (client)" className={field} />
      </div>
      <textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="The problem it solved" rows={2} className={field} />
      <textarea value={solution} onChange={(e) => setSolution(e.target.value)} placeholder="How it works — stages, models, checks" rows={2} className={field} />
      <input value={stack} onChange={(e) => setStack(e.target.value)} placeholder="Stack, comma-separated: whisper.cpp, Claude, ffmpeg" className={field} />
      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder={"# The copyable spec\nStages, pins, what to adapt per client. This is what Copy spec puts on the clipboard."}
        rows={6}
        className={`${field} font-mono text-[12px]`}
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || !name.trim() || !oneLiner.trim() || !payload.trim()}
          className="pressable rounded-full bg-indigo px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Shelve it
        </button>
      </div>
    </form>
  );
}

export function BlueprintShelf({ blueprints, clients }: { blueprints: Blueprint[]; clients: Client[] }) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<BlueprintKind | "all">("all");

  const shown = blueprints
    .filter((b) => filter === "all" || b.kind === filter)
    .sort(
      (a, b) =>
        (a.status === "proven" ? 0 : 1) - (b.status === "proven" ? 0 : 1) ||
        b.uses.length - a.uses.length,
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...BLUEPRINT_KINDS] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`pressable min-h-[36px] rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === k ? "bg-ink text-white" : "border border-line bg-white text-slate hover:text-ink"
              }`}
            >
              {k === "all" ? "Everything" : BLUEPRINT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="pressable rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo"
        >
          {adding ? "Close" : "New blueprint"}
        </button>
      </div>

      {adding && <NewBlueprintForm done={() => setAdding(false)} />}

      {shown.length === 0 && !adding && (
        <div className="mt-6 rounded-card border border-dashed border-line bg-white/60 p-8 text-center text-slate">
          <p className="display text-lg text-ink">Nothing on the shelf here.</p>
          <p className="mt-1 text-sm">
            {filter === "all"
              ? "Ship something for a client, then shelve it so the next client starts from it."
              : "No blueprints of this kind yet — try another filter, or shelve one."}
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {shown.map((bp) => (
          <BlueprintCard key={bp.id} bp={bp} clients={clients} />
        ))}
      </ul>
    </div>
  );
}
