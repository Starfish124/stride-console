import { NextResponse } from "next/server";
import { listIssues } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return NextResponse.json(
    listIssues({
      projectId: params.get("projectId") ?? undefined,
      clientId: params.get("clientId") ?? undefined,
    }),
  );
}
