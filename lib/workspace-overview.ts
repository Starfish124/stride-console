import type { CalendarEntry } from "./calendar.ts";
import type { Draft } from "./types.ts";
import { RECIPE_LABELS } from "./types.ts";
export interface WorkspaceAction {
  id: string;
  title: string;
  detail: string;
  href: string;
  category: "approval" | "followup";
  urgent: boolean;
  label: string;
}
/** No new queue or writes: the overview links directly to the source record. */
export function workspaceActions(
  calendar: CalendarEntry[],
  drafts: Draft[],
  replies: number,
  today: string,
): WorkspaceAction[] {
  const followups: WorkspaceAction[] = calendar
    .filter((e) => e.actionable && e.date <= today)
    .map((e) => ({
      id: e.id,
      title: e.title,
      detail: e.detail ?? "Open the calendar to review the next step.",
      href: e.href ?? "/calendar",
      category: "followup",
      urgent: e.date < today,
      label: e.date < today ? "Overdue" : "Today",
    }));
  const approvals: WorkspaceAction[] = drafts
    .filter((d) => d.status === "draft")
    .map((d) => ({
      id: d.id,
      title: RECIPE_LABELS[d.recipe],
      detail: "Review the draft and approve it when it’s ready.",
      href: `/drafts/${d.id}`,
      category: "approval",
      urgent: false,
      label: "Review draft",
    }));
  if (replies > 0)
    followups.push({
      id: "replies",
      title: `${replies} ${replies === 1 ? "reply needs" : "replies need"} an answer`,
      detail: "Continue the conversations in your outreach inbox.",
      href: "/outreach#replies",
      category: "followup",
      urgent: false,
      label: "Reply",
    });
  return [
    ...followups.sort((a, b) => Number(b.urgent) - Number(a.urgent)),
    ...approvals,
  ];
}
