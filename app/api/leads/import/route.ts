import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { importLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

/**
 * Copy the Apollo export into the client book.
 *
 * Dry unless the caller says otherwise, so the first press reports what it
 * would do. data/ is gitignored and clients.json has no history: an import
 * that turns out to have mapped the wrong field is not something anybody can
 * undo, so the confirmation is the only safety net there is.
 *
 * Thin on purpose — every test in this repo goes through the lib, not a route.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };
  return NextResponse.json(importLeads({ dryRun: body.confirm !== true }));
}
