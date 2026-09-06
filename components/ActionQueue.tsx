"use client";
import { useState } from "react";
import Link from "next/link";
import { Glyph } from "@/components/icons";
import { EmptyState } from "@/components/WorkspaceUI";
import { cn } from "@/lib/cn";
import type { WorkspaceAction } from "@/lib/workspace-overview";
export function ActionQueue({ actions }: { actions: WorkspaceAction[] }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const shown = actions.filter(
    (a) => filter === "all" || a.category === filter,
  );
  return (
    <section
      className="workspace-panel action-panel"
      aria-labelledby="attention-title"
    >
      <div className="section-heading">
        <h2 id="attention-title">
          Needs your attention{" "}
          <span className="count-badge">{actions.length}</span>
        </h2>
        <Link className="text-link" href="/today">
          Activity
          <Glyph name="IconChevron" size={14} />
        </Link>
      </div>
      <div
        className="queue-filters"
        role="group"
        aria-label="Filter action queue"
      >
        {[
          { id: "all", label: "All tasks" },
          { id: "approval", label: "Approvals" },
          { id: "followup", label: "Follow-ups" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => { setFilter(f.id); setExpanded(false); }}
            className={cn(filter === f.id && "is-active")}
          >
            {f.label}
            <span>
              {
                actions.filter((a) => f.id === "all" || a.category === f.id)
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <div>
        <span className="sr-only" role="status">{shown.length} matching actions</span>
        {shown.length === 0 ? (
          <EmptyState
            icon="IconApproved"
            title={
              filter === "all" ? "You’re all caught up" : "Nothing waiting here"
            }
            description={
              filter === "all"
                ? "Approvals and follow-ups will appear here when they need you. There’s room to start something new."
                : "Try another filter or check your calendar for what’s coming up."
            }
            href={filter === "approval" ? "/#create-content" : "/calendar"}
            action={filter === "approval" ? "Create a draft" : "Open calendar"}
          />
        ) : (
          <ul className="action-list">
            {shown.slice(0, expanded ? shown.length : 4).map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="action-row">
                  <span className={cn("action-icon", a.urgent && "urgent")}>
                    <Glyph
                      name={
                        a.category === "approval" ? "IconReview" : "IconTime"
                      }
                      size={19}
                    />
                  </span>
                  <span className="action-copy">
                    <strong>{a.title}</strong>
                    <small>{a.detail}</small>
                  </span>
                  <span className={cn("status-label", a.urgent && "urgent")}>
                    {a.label}
                  </span>
                  <Glyph name="IconChevron" size={15} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {shown.length > 4 && (
        <button type="button" className="queue-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show all ${shown.length} actions`}
          <Glyph name="IconChevron" size={16} />
        </button>
      )}
    </section>
  );
}
