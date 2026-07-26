import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runAccount } from "@/lib/channels/linkedHelper";

export const dynamic = "force-dynamic";

/**
 * Start an account's campaign runner.
 *
 * The bridge refuses when unpaused campaigns would reach more people than the
 * ceiling, and says how many. `force` is what the founder sends after reading
 * that number, never a default.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; force?: boolean };
  const result = await runAccount(body.email ?? "", { force: body.force === true });
  return NextResponse.json(result.body, { status: result.status });
}
