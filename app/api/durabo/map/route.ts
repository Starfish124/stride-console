import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { duraboRoot } from "@/lib/durabo/io";

// Jort's generated map, served to the phone. The HTML is self-contained
// (fonts vendored, no network) and regenerated from the employee files —
// never edited, so serving the file byte-for-byte is the whole feature.
export async function GET() {
  try {
    const html = fs.readFileSync(path.join(duraboRoot(), "Map", "Durabo-Map.html"));
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "De kaart is nog niet gegenereerd." }, { status: 404 });
  }
}

/** Rebuild: run the repo's own generator, then the GET above serves the result. */
export async function POST() {
  const root = duraboRoot();
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn("python3", [path.join(root, "Map", "build_map.py")], {
      cwd: root,
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 30_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
  if (!ok) return NextResponse.json({ error: "build_map.py faalde." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
