import { NextResponse } from "next/server";
import { previewItems } from "@/lib/pipeline/source";

export const dynamic = "force-dynamic";

/**
 * Live scan of every source: what the machine is reading right now.
 * Read-only — nothing is marked seen, no myth is consumed, no draft written.
 */
export async function GET() {
  const { items, report } = await previewItems(40);
  return NextResponse.json({ items, report, at: new Date().toISOString() });
}
