import { NextResponse } from "next/server";
import { channelHealth } from "@/lib/channels";

export const dynamic = "force-dynamic";

/**
 * Is each way out to LinkedIn actually working right now.
 * Read-only: no campaign is touched, nothing is published.
 */
export async function GET() {
  const channels = await channelHealth();
  return NextResponse.json({ channels, at: new Date().toISOString() });
}
