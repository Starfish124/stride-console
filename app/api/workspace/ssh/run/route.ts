import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { runAudited, sshMode } from "@/lib/workspace/sshGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Whether a run would execute or stay dry. The UI badge reads this. */
export async function GET() {
  return NextResponse.json({ mode: sshMode() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const jar = await cookies();
  const result = runAudited({
    connectorId: typeof body.connectorId === "string" ? body.connectorId : "",
    command: typeof body.command === "string" ? body.command : "",
    confirm: typeof body.confirm === "string" ? body.confirm : "",
    by: jar.get(FOUNDER_COOKIE)?.value ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.problem }, { status: 400 });
  }
  return NextResponse.json(result);
}
