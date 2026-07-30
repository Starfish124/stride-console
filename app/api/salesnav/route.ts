import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { salesnavStatus } from "@/lib/salesnav/channel";
import { setHardStop } from "@/lib/salesnav/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(salesnavStatus());
}

/**
 * The stop switch.
 *
 * Stopping is one field. Resuming needs a second, because a fat finger on a
 * phone must not be able to restart cold email sending by accident, and the
 * two directions are not equally dangerous.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    stop?: boolean;
    reason?: string;
    confirm?: string;
  };
  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";

  if (body.stop === true) {
    setHardStop({ stopped: true, by: who, reason: body.reason?.trim() });
    return NextResponse.json(salesnavStatus());
  }

  if (body.stop === false) {
    if (body.confirm !== "resume") {
      return NextResponse.json(
        { error: 'Send confirm: "resume" as well. Restarting sending is not a one tap action.' },
        { status: 400 },
      );
    }
    setHardStop({ stopped: false, by: who, reason: body.reason?.trim() });
    return NextResponse.json(salesnavStatus());
  }

  return NextResponse.json({ error: "Send stop: true or stop: false." }, { status: 400 });
}
