import { NextResponse } from "next/server";
import { listRuns } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  return NextResponse.json(listRuns(projectId));
}
