import { NextResponse } from "next/server";
import { markInboxSeen } from "@/lib/store";

/** Dismiss the ready-to-review banner: mark every inbox entry seen. */
export async function POST() {
  markInboxSeen();
  return NextResponse.json({ ok: true });
}
