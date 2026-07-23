import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { RENDERS_DIR } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;
  // No traversal: single flat filename inside the draft's render dir.
  if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+$/.test(file)) {
    return NextResponse.json({ error: "Bad path." }, { status: 400 });
  }
  const full = path.join(RENDERS_DIR, id, file);
  if (!fs.existsSync(full)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const buffer = fs.readFileSync(full);
  const type = file.endsWith(".pdf") ? "application/pdf" : "image/png";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
    },
  });
}
