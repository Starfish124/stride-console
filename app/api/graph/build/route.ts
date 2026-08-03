import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Rebuild the graph. Code extraction is tree-sitter and calls no API, so
 * this costs nothing but CPU — a few seconds per repo, and it caches.
 */
export async function POST() {
  const script = path.join(process.cwd(), "scripts", "graph-build.mjs");
  return new Promise<NextResponse>((resolve) => {
    const child = spawn(process.execPath, [script, "--quiet"], {
      cwd: process.cwd(),
      env: process.env,
    });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", () =>
      resolve(NextResponse.json({ error: "The builder could not start." }, { status: 500 })),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        console.error("graph-build:", err);
        resolve(
          NextResponse.json(
            { error: err.split("\n").filter(Boolean).pop() ?? "The build failed." },
            { status: 502 },
          ),
        );
        return;
      }
      resolve(NextResponse.json({ ok: true }));
    });
  });
}
