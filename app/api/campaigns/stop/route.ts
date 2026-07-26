import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stopAccount } from "@/lib/channels/linkedHelper";

export const dynamic = "force-dynamic";

/** Stop the runner. Always allowed: nothing is safer than off. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const result = await stopAccount(body.email ?? "");
  return NextResponse.json(result.body, { status: result.status });
}
