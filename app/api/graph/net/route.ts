import { NextResponse } from "next/server";
import { network } from "@/lib/graph/net";

export const dynamic = "force-dynamic";

/** The graph collapsed to one node per file, for drawing. Behind the login. */
export async function GET() {
  return NextResponse.json(network());
}
