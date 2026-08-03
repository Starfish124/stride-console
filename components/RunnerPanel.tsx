"use client";

// Give the project a task, watch Claude work, read the diff it left.

import { useCallback, useEffect, useState } from "react";
import { IssuesPanel, type IssueView } from "@/components/IssuesPanel";

interface RunView {
  id: string;
  task: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  output?: string;
  diff?: string;
  by?: string;
}

interface RecipeView {
  id: string;
  name: string;
  task: string;
  builtin?: boolean;
}

export function RunnerPanel({ projectId, repo = false }: { projectId: string; repo?: boolean }) {
  const [task, setTask] = useState("");
  const [full, setFull] = useState(false);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [history, setHistory] = useState<RunView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeView[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [issues, setIssues] = useState<IssueView[]>([]);

  const loadHistory = useCallback(async () => {
    const [runsRes, recipesRes, issuesRes] = await Promise.all([
      fetch(`/api/workspace/runs?projectId=${projectId}`, { cache: "no-store" }),
      fetch("/api/workspace/recipes", { cache: "no-store" }),
      fetch(`/api/workspace/issues?projectId=${projectId}`, { cache: "no-store" }),
    ]);
    if (runsRes.ok) setHistory(await runsRes.json());
    if (recipesRes.ok) setRecipes(await recipesRes.json());
    if (issuesRes.ok) setIssues(await issuesRes.json());
  }, [projectId]);

  useEffect(() => {
    // Fetch-on-mount: every setState in loadHistory happens after an await,
    // never synchronously during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, [loadHistory]);

  const start = useCallback(async () => {
    if (!task.trim() || running) return;
    setRunning(true);
    setError(null);
    setRun(null);
    setTranscript("");
    const res = await fetch(`/api/workspace/projects/${projectId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, full }),
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "The run could not start.");
      setRunning(false);
      return;
    }
    const runId = res.headers.get("X-Run-Id");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      setTranscript((t) => (t ?? "") + text);
    }
    if (runId) {
      const record = await fetch(`/api/workspace/runs/${runId}`, { cache: "no-store" });
      if (record.ok) setRun(await record.json());
    }
    setRunning(false);
    setFull(false); // per run, never sticky
    setTask("");
    loadHistory();
  }, [full, loadHistory, projectId, running, task]);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-white p-4">
        <p className="eyebrow text-slate">Run Claude on this project</p>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={recipeId}
            onChange={(e) => {
              const recipe = recipes.find((r) => r.id === e.target.value);
              setRecipeId(e.target.value);
              if (recipe) setTask(recipe.task);
            }}
            className="flex-1 rounded-input border border-line bg-white px-3 py-1.5 text-sm text-ink"
          >
            <option value="">A recipe, or write your own below</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {recipeId && !recipes.find((r) => r.id === recipeId)?.builtin && (
            <button
              type="button"
              className="eyebrow text-mute pressable hover:text-amber"
              onClick={async () => {
                await fetch(`/api/workspace/recipes?id=${recipeId}`, { method: "DELETE" });
                setRecipeId("");
                loadHistory();
              }}
            >
              Remove
            </button>
          )}
        </div>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="What should change? Plain words. It reads the files itself."
          rows={3}
          className="mt-3 w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-mute"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={full}
              onChange={(e) => setFull(e.target.checked)}
            />
            Full permissions — Claude may run commands in this project
          </label>
          <span className="flex items-center gap-3">
            {task.trim() && (
              <button
                type="button"
                className="eyebrow text-indigo pressable"
                onClick={async () => {
                  const name = window.prompt("Name this recipe");
                  if (!name?.trim()) return;
                  await fetch("/api/workspace/recipes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, task }),
                  });
                  loadHistory();
                }}
              >
                Save as recipe
              </button>
            )}
            <button
              type="button"
              onClick={start}
              disabled={running || !task.trim()}
              className="rounded-input bg-indigo px-4 py-1.5 text-sm text-white pressable disabled:bg-mute"
            >
              {running ? "Running…" : "Run"}
            </button>
          </span>
        </div>
        {error && <p className="mt-2 text-sm text-amber">{error}</p>}
      </div>

      <IssuesPanel
        issues={issues}
        onFix={(t) => {
          setTask(t);
          setRecipeId("");
        }}
        onChanged={loadHistory}
      />

      {transcript !== null && (
        <div className="rounded-card border border-line bg-white">
          <p className="eyebrow border-b border-line px-4 py-2 text-slate">
            {running ? "Working…" : "Transcript"}
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-4 py-3 text-xs text-ink">
            {transcript || "…"}
          </pre>
        </div>
      )}

      {run?.diff && (
        <div className="rounded-card border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <p className="eyebrow text-slate">What changed</p>
            {repo && (
              <button
                type="button"
                disabled={pushing}
                className="eyebrow text-indigo pressable disabled:text-mute"
                onClick={async () => {
                  setPushing(true);
                  setPushNote(null);
                  const res = await fetch(`/api/workspace/projects/${projectId}/push`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: run.task }),
                  });
                  const body = await res.json().catch(() => ({}));
                  setPushing(false);
                  setPushNote(body.message ?? body.error ?? "Done.");
                }}
              >
                {pushing ? "Pushing…" : "Push to their repo"}
              </button>
            )}
          </div>
          <pre className="max-h-96 overflow-auto px-4 py-3 text-xs text-ink">{run.diff}</pre>
          {pushNote && <p className="border-t border-line px-4 py-2 text-sm text-slate">{pushNote}</p>}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="eyebrow mb-2 text-slate">Past runs</p>
          <ul className="inset-group">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left pressable"
                  onClick={() => {
                    setRun(h);
                    setTranscript(h.output ?? "");
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{h.task}</span>
                  <span
                    className={`tabular text-xs ${
                      h.status === "failed" ? "text-amber" : "text-mute"
                    }`}
                  >
                    {h.status} · {h.startedAt.slice(0, 10)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
