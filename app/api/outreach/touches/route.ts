import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { getSequence } from "@/lib/outreach/sequence";
import { queueCounts, settleTouch } from "@/lib/outreach/queue";
import { getTouch, pendingTouches } from "@/lib/outreach/touch";
import { getEnrolment } from "@/lib/salesnav/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ touches: pendingTouches(), counts: queueCounts() });
}

/**
 * A founder says they sent it, or passed on it.
 *
 * "Sent" is a claim by a person. Nothing here watched LinkedIn, so the record
 * says who said so and when, and the page is written to match — this endpoint
 * must never be described as confirmation that a message arrived.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    action?: string;
    note?: string;
  };

  if (!body.id) return NextResponse.json({ error: "Which touch." }, { status: 400 });
  if (body.action !== "done" && body.action !== "skip") {
    return NextResponse.json({ error: 'Send action: "done" or "skip".' }, { status: 400 });
  }

  const touch = getTouch(body.id);
  if (!touch) return NextResponse.json({ error: "No such touch." }, { status: 404 });

  // The enrolment and the sequence have to be here, because settling a touch
  // moves the sequence on. If either is gone the touch is an orphan: say so
  // rather than settling something that can no longer advance anything.
  const enrolment = getEnrolment(touch.enrolmentId);
  const sequence = enrolment ? getSequence(enrolment.sequenceId) : undefined;
  if (!enrolment || !sequence) {
    return NextResponse.json(
      { error: "The sequence or the enrolment behind this one is gone. Nothing to move on." },
      { status: 409 },
    );
  }

  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";

  const result = settleTouch({
    id: body.id,
    action: body.action,
    by: who,
    note: body.note,
    sequence,
    enrolment,
  });

  if (!result.ok) return NextResponse.json({ error: result.problem }, { status: 409 });
  return NextResponse.json({ touch: result.touch, counts: queueCounts() });
}
