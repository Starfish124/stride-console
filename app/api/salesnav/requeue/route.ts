import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requeueWaiting } from "@/lib/salesnav/manual";

export const dynamic = "force-dynamic";

/**
 * The words changed; rewrite what has not gone out.
 *
 * Nothing is edited in place. The waiting rows are forgotten and the runner
 * queues them again from the sequence as it now reads — same merge, same
 * length gate, same caps. Anything already sent or skipped is history and is
 * not touched, which is the promise the whole ledger rests on.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { sequenceId?: string };
  if (!body.sequenceId) return NextResponse.json({ error: "Which sequence." }, { status: 400 });
  return NextResponse.json(requeueWaiting(body.sequenceId));
}
