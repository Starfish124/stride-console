import { NextResponse } from "next/server";
import { readSshAudit } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

/** The audit tail, newest first. */
export async function GET(request: Request) {
  const connectorId = new URL(request.url).searchParams.get("connectorId") ?? undefined;
  return NextResponse.json(readSshAudit(connectorId).slice(-50).reverse());
}
