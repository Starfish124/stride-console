import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { completeManual, repliedManual, skipManual, waitingManualSteps } from "@/lib/salesnav/manual";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ waiting: waitingManualSteps() });
}

/**
 * A founder saying what happened to one LinkedIn step.
 *
 * "sent" is the only thing that advances the sequence in the normal case, so
 * it is a claim a person makes, never one this code infers. There is nothing
 * to verify it against — LinkedIn cannot be read from here — and pretending
 * otherwise would put a guess in the ledger.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    key?: string;
    action?: string;
    reason?: string;
  };
  if (!body.key) return NextResponse.json({ error: "Which step." }, { status: 400 });

  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";

  const manual =
    body.action === "sent"
      ? completeManual(body.key, who)
      : body.action === "skipped"
        ? skipManual(body.key, who, body.reason ?? "Skipped.")
        : body.action === "replied"
          ? repliedManual(body.key, who)
          : undefined;

  if (!manual) {
    return NextResponse.json(
      { error: "Send action: sent, skipped or replied, for a step still waiting." },
      { status: 400 },
    );
  }
  return NextResponse.json({ manual });
}
