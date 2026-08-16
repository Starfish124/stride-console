import { NextResponse } from "next/server";
import { listInboundSince } from "@/lib/whatsapp/store";
import { founderFor } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

/**
 * Stride-related WhatsApp, no date attached, for the calendar's read-only
 * side panel. Sourced entirely from the Stride group — lib/whatsapp/store.ts
 * queries nothing else — so this is never a founder's personal chat, just
 * whatever the group itself carries.
 *
 * A Route Handler rather than a direct import into a Server Component page:
 * lib/whatsapp/store.ts opens node:sqlite, and Turbopack's RSC render graph
 * fails to bundle that ("Failed to load external module node:sqlite:
 * ReferenceError: require is not defined") in a way it does not for a route
 * handler's plain Node function context — the same reason the status and QR
 * routes already live here instead of being imported straight into a page.
 *
 * Behind the console login, like everything that is not the QR itself.
 */
export async function GET() {
  const signals = listInboundSince("1970-01-01T00:00:00", 300)
    .filter((m) => founderFor(m.founderNumber ?? ""))
    .slice(-6)
    .reverse()
    .map((m) => ({
      id: m.id,
      from: founderFor(m.founderNumber ?? "")!.name,
      snippet: m.content.length > 140 ? `${m.content.slice(0, 140)}…` : m.content,
      timestamp: m.timestamp,
    }));
  return NextResponse.json(signals);
}
