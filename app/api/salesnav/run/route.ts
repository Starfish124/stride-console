import { NextResponse } from "next/server";
import { isTicking, tick } from "@/lib/salesnav/runner";

export const dynamic = "force-dynamic";

/**
 * One tick, and the only way anything is ever sent.
 *
 * The runner script calls this every minute with a session cookie it mints
 * itself, and the Run now button calls exactly the same route. Two callers,
 * one code path, so there is no second behaviour to debug. It stays behind the
 * normal cookie in proxy.ts, so nothing new became reachable from the internet.
 */
export async function POST() {
  if (isTicking()) {
    return NextResponse.json({ error: "A tick is already running." }, { status: 409 });
  }
  return NextResponse.json(await tick());
}
