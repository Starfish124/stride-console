"use client";

// What the audit found, still here long after the transcript scrolled away.
// Rendered by RunnerPanel, which owns the task box — so "Fix this" is a
// prop, not a message between siblings.

import { useState } from "react";

export interface IssueView {
  id: string;
  title: string;
  severity: "low" | "med" | "high";
  file?: string;
  line?: number;
  detail: string;
  fix?: string;
  status: "open" | "dismissed" | "fixed";
}

const TONE: Record<IssueView["severity"], string> = {
  high: "text-amber",
  med: "text-slate",
  low: "text-mute",
};

export function IssuesPanel({
  issues,
  onFix,
  onChanged,
}: {
  issues: IssueView[];
  onFix: (task: string) => void;
  onChanged: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const open = issues.filter((i) => i.status === "open");
  const done = issues.filter((i) => i.status !== "open");
  const shown = showDone ? issues : open;

  if (issues.length === 0) return null;

  async function setStatus(id: string, status: string) {
    await fetch(`/api/workspace/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onChanged();
  }

  function fixPrompt(issue: IssueView): string {
    const where = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})` : "";
    return `Fix this issue found by the audit:\n${issue.title}${where}\n${issue.detail}${
      issue.fix ? `\nSuggested fix: ${issue.fix}` : ""
    }`;
  }

  return (
    <div className="rounded-card border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <p className="eyebrow text-slate">
          What the audit found · {open.length} open
        </p>
        {done.length > 0 && (
          <button
            type="button"
            className="eyebrow text-mute hover:text-ink"
            onClick={() => setShowDone(!showDone)}
          >
            {showDone ? "Hide handled" : `${done.length} handled`}
          </button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {shown.map((issue) => (
          <li key={issue.id} className="px-4 py-2">
            <button
              type="button"
              className="flex w-full items-start gap-3 text-left"
              onClick={() => setOpenId(openId === issue.id ? null : issue.id)}
            >
              <span className={`eyebrow ${TONE[issue.severity]}`}>{issue.severity}</span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    issue.status === "open" ? "text-ink" : "text-mute line-through"
                  }`}
                >
                  {issue.title}
                </span>
                {issue.file && (
                  <span className="tabular block truncate text-xs text-mute">
                    {issue.file}
                    {issue.line ? `:${issue.line}` : ""}
                  </span>
                )}
              </span>
            </button>

            {openId === issue.id && (
              <div className="mt-2 space-y-2 pl-1">
                <p className="text-sm text-slate">{issue.detail}</p>
                {issue.fix && (
                  <p className="text-sm text-slate">
                    <span className="eyebrow text-mute">Fix</span> {issue.fix}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="eyebrow text-indigo pressable"
                    onClick={() => onFix(fixPrompt(issue))}
                  >
                    Fix this
                  </button>
                  {issue.status !== "fixed" && (
                    <button
                      type="button"
                      className="eyebrow text-mute hover:text-ink"
                      onClick={() => setStatus(issue.id, "fixed")}
                    >
                      Mark fixed
                    </button>
                  )}
                  {issue.status !== "dismissed" && (
                    <button
                      type="button"
                      className="eyebrow text-mute hover:text-ink"
                      onClick={() => setStatus(issue.id, "dismissed")}
                    >
                      Dismiss
                    </button>
                  )}
                  {issue.status !== "open" && (
                    <button
                      type="button"
                      className="eyebrow text-mute hover:text-ink"
                      onClick={() => setStatus(issue.id, "open")}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
