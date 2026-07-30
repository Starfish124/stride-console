import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClient } from "@/lib/store";
import { getSequence } from "@/lib/outreach/sequence";
import { draftEmail } from "@/lib/salesnav/draft";

export const dynamic = "force-dynamic";

/**
 * Draft or redraft one email step.
 *
 * The verdict comes back with the draft even when it fails, and the draft is
 * still returned. The gate reports here; what it refuses is queuing, not
 * writing. Same split as app/api/outreach/route.ts.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    sequenceId?: string;
    stepIndex?: number;
    clientId?: string;
  };

  const client = getClient(body.clientId ?? "");
  if (!client) return NextResponse.json({ error: "No such client." }, { status: 400 });

  const sequence = getSequence(body.sequenceId ?? "");
  if (!sequence) return NextResponse.json({ error: "No such sequence." }, { status: 400 });

  const stepIndex = Number(body.stepIndex ?? 0);
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= sequence.steps.length) {
    return NextResponse.json({ error: "That step is not in the sequence." }, { status: 400 });
  }

  const draft = await draftEmail(client, sequence, stepIndex);
  return NextResponse.json({ draft });
}
