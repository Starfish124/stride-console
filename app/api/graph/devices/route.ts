import { NextResponse } from "next/server";
import { addDevice, deviceViews, removeDevice } from "@/lib/graph/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(deviceViews());
}

/**
 * Connect a machine. The token comes back exactly once, inside the command
 * the founder copies — after this the console only ever reports that a
 * device has one.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
  if (!label) return NextResponse.json({ error: "Name the machine." }, { status: 400 });

  const device = addDevice(label);
  const base = process.env.STRIDE_PUBLIC_URL ?? "https://mac-mini.tailc91701.ts.net";
  return NextResponse.json({
    device: { id: device.id, label: device.label },
    // One line to paste into a terminal on that machine.
    command: `curl -fsSL "${base}/api/graph/connect?token=${device.token}" | bash`,
  });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!removeDevice(id)) {
    return NextResponse.json({ error: "No such device." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
