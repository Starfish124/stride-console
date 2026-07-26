import { NextResponse } from "next/server";
import { readCampaignsView } from "@/lib/channels/linkedHelper";

export const dynamic = "force-dynamic";

/**
 * What Linked Helper is running, read straight from its database.
 * Read-only: no campaign is started, paused or altered here.
 */
export async function GET() {
  return NextResponse.json(await readCampaignsView());
}
