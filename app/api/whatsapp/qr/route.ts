import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const QR_FILE = path.join(process.cwd(), "data", "whatsapp-qr.png");

export const dynamic = "force-dynamic";

/** The pairing QR, while one is waiting to be scanned. 404 once paired —
 *  the file is removed the moment the bridge connects. */
export async function GET() {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(QR_FILE);
  } catch {
    return NextResponse.json({ error: "No QR waiting." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
