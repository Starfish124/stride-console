"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  CLIENT_STAGES,
  STAGE_LABELS,
  type Client,
  type ClientStage,
} from "@/lib/types";
import { Glyph } from "@/components/icons";
import { cn } from "@/lib/cn";
const EMPTY = {
  name: "",
  company: "",
  stage: "lead" as ClientStage,
  source: "",
  need: "",
  value: "",
  nextStep: "",
};
const euros = (n: number) => `€${n.toLocaleString("en-GB")}`;
export function ClientsBoard({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [view, setView] = useState("list");
  const [form, setForm] = useState(EMPTY);
  const [shown, moveOptimistically] = useOptimistic(
    clients,
    (current: Client[], moved: { id: string; stage: ClientStage }) =>
      current.map((c) =>
        c.id === moved.id ? { ...c, stage: moved.stage } : c,
      ),
  );
  const [moving, startTransition] = useTransition();
  const filtered = shown.filter(
    (c) =>
      (stageFilter === "all" || c.stage === stageFilter) &&
      `${c.name} ${c.company} ${c.need ?? ""} ${c.owner ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.name.trim() && !form.company.trim()) {
      setError("Add a contact name or company to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          value: form.value.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setForm(EMPTY);
      setAdding(false);
      router.refresh();
    } catch {
      setError(
        "Your client wasn’t saved. Your details are still here; please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function move(client: Client, stage: ClientStage) {
    setError("");
    startTransition(async () => {
      moveOptimistically({ id: client.id, stage });
      try {
        const res = await fetch(`/api/clients/${client.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        });
        if (!res.ok) throw new Error();
        router.refresh();
      } catch {
        setError(
          `Couldn’t update ${client.company || client.name}. Please try again.`,
        );
      }
    });
  }
  function stageSelect(c: Client) {
    return (
      <select
        className="stage-select"
        aria-label={`Stage for ${c.company || c.name}`}
        value={c.stage}
        disabled={moving}
        onChange={(e) => move(c, e.target.value as ClientStage)}
      >
        {CLIENT_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
    );
  }
  function nextStep(c: Client) {
    if (!c.nextStep)
      return <span className="text-slate">No next step set</span>;
    const overdue = c.nextStep < new Date().toISOString().slice(0, 10);
    return (
      <span className={cn(overdue && "text-amber-deep")}>
        <span>
          {new Date(`${c.nextStep}T12:00:00Z`).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
        </span>
        {overdue && <span className="due-tag">Overdue</span>}
      </span>
    );
  }
  return (
    <div className="client-workspace">
      <div className="collection-toolbar">
        <label className="collection-search">
          <Glyph name="IconSearch" size={18} />
          <input
            aria-label="Search clients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, people, or work…"
          />
        </label>
        <div className="collection-controls">
          <select
            aria-label="Filter by stage"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <option value="all">All stages</option>
            {CLIENT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="view-switch" role="group" aria-label="Client view">
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <Glyph name="IconLayers" size={16} />
              <span>List</span>
            </button>
            <button
              type="button"
              aria-label="Board view"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
            >
              <Glyph name="IconGrid" size={16} />
              <span>Board</span>
            </button>
          </div>
          <button
            type="button"
            className="primary-button"
            aria-expanded={adding}
            aria-controls="new-client-form"
            onClick={() => {
              setAdding(!adding);
              setError("");
            }}
          >
            {adding ? "Close form" : "Add client"}
            <span aria-hidden>{adding ? "−" : "+"}</span>
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {adding && (
        <form id="new-client-form" onSubmit={add} className="workspace-form">
          <div className="form-heading">
            <h2>A new relationship</h2>
            <p>A name or company is all you need to get started.</p>
          </div>
          <div className="form-grid">
            {[
              { key: "name", label: "Contact name", placeholder: "Full name" },
              { key: "company", label: "Company", placeholder: "Company name" },
              {
                key: "source",
                label: "Source",
                placeholder: "Referral, website, event…",
              },
              {
                key: "value",
                label: "Deal value (€)",
                placeholder: "Optional",
              },
            ].map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  autoFocus={f.key === "name"}
                  value={form[f.key as keyof typeof form]}
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value })
                  }
                  placeholder={f.placeholder}
                  inputMode={f.key === "value" ? "decimal" : undefined}
                />
              </label>
            ))}
            <label>
              Stage
              <select
                value={form.stage}
                onChange={(e) =>
                  setForm({ ...form, stage: e.target.value as ClientStage })
                }
              >
                {CLIENT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Next step date
              <input
                type="date"
                value={form.nextStep}
                onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
              />
            </label>
            <label className="full-width">
              What do they need?
              <textarea
                rows={2}
                value={form.need}
                onChange={(e) => setForm({ ...form, need: e.target.value })}
                placeholder="A few words about the work ahead"
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Saving…" : "Save client"}
            </button>
          </div>
        </form>
      )}
      <div className="collection-caption" aria-live="polite">
        <span>
          {filtered.length}{" "}
          {filtered.length === 1 ? "relationship" : "relationships"}
          {query || stageFilter !== "all" ? ` of ${shown.length}` : ""}
        </span>
        <span>Every conversation, a next step.</span>
      </div>
      {filtered.length === 0 ? (
        <div className="workspace-panel workspace-empty">
          <span className="empty-icon">
            <Glyph name="IconTeam" size={26} />
          </span>
          <h3>
            {clients.length === 0
              ? "Your next relationship starts here"
              : "No matching clients"}
          </h3>
          <p>
            {clients.length === 0
              ? "Keep contacts, conversations, and next steps together. Add a client or lead to get started."
              : "Try a different search or clear your filters."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (clients.length === 0) setAdding(true);
              else {
                setQuery("");
                setStageFilter("all");
              }
            }}
          >
            {clients.length === 0 ? "Add your first client" : "Clear filters"}
          </button>
        </div>
      ) : view === "list" ? (
        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <caption className="sr-only">
              Clients and leads with stage, value and next step
            </caption>
            <thead>
              <tr>
                <th scope="col">Company / contact</th>
                <th scope="col">Stage</th>
                <th scope="col">Value</th>
                <th scope="col">Next step</th>
                <th scope="col">
                  <span className="sr-only">Open client</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="table-client" href={`/clients/${c.id}`}>
                      <span className="client-monogram">
                        {(c.company || c.name).slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <strong>{c.company || c.name}</strong>
                        <small>
                          {c.company ? c.name : c.need || "Contact"}
                        </small>
                      </span>
                    </Link>
                  </td>
                  <td>{stageSelect(c)}</td>
                  <td className="tabular-nums">
                    {c.value !== undefined ? euros(c.value) : "—"}
                  </td>
                  <td>{nextStep(c)}</td>
                  <td>
                    <Link
                      className="table-open"
                      aria-label={`Open ${c.company || c.name}`}
                      href={`/clients/${c.id}`}
                    >
                      <Glyph name="IconChevron" size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="client-kanban">
          {CLIENT_STAGES.filter(
            (s) => stageFilter === "all" || stageFilter === s,
          ).map((stage) => (
            <section key={stage} className="kanban-column">
              <h2>
                {STAGE_LABELS[stage]}
                <span className="count-badge">
                  {filtered.filter((c) => c.stage === stage).length}
                </span>
              </h2>
              <ul>
                {filtered
                  .filter((c) => c.stage === stage)
                  .map((c) => (
                    <li key={c.id}>
                      <Link href={`/clients/${c.id}`}>
                        <span className="client-monogram">
                          {(c.company || c.name).slice(0, 2).toUpperCase()}
                        </span>
                        <h3>{c.company || c.name}</h3>
                        <p>{c.company ? c.name : c.need}</p>
                        {c.need && <p>{c.need}</p>}
                        <strong>
                          {c.value !== undefined
                            ? euros(c.value)
                            : "Value not set"}
                        </strong>
                        <small>{nextStep(c)}</small>
                      </Link>
                      {stageSelect(c)}
                    </li>
                  ))}
              </ul>
              {!filtered.some((c) => c.stage === stage) && (
                <p className="kanban-empty">No clients at this stage</p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
