import { NextResponse } from "next/server";
import { getIssue, putIssue } from "@/lib/workspace/store";
import type { IssueStatus } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";

const STATUSES: IssueStatus[] = ["open", "dismissed", "fixed"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const issue = getIssue(id);
  if (!issue) return NextResponse.json({ error: "No such issue." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!STATUSES.includes(body.status as IssueStatus)) {
    return NextResponse.json({ error: "Open, dismissed or fixed." }, { status: 400 });
  }
  const updated = { ...issue, status: body.status as IssueStatus };
  putIssue(updated);
  return NextResponse.json(updated);
}
