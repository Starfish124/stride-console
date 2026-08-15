import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { lastInboundAt, messageCount } from "@/lib/whatsapp/store";
import { founderContacts } from "@/lib/whatsapp/config";

const STATUS_FILE = path.join(process.cwd(), "data", "whatsapp-bridge.json");

export const dynamic = "force-dynamic";

/** Behind the console login, like everything that is not the QR itself. */
export async function GET() {
  let bridge: Record<string, unknown> = { paired: false };
  try {
    bridge = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    /* the wrapper has never run: unpaired is the honest answer */
  }
  return NextResponse.json({
    ...bridge,
    founders: founderContacts().map((f) => f.name),
    messageCount: messageCount(),
    lastInboundAt: lastInboundAt() ?? null,
  });
}
