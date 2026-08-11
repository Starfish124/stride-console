import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { readTranscript, run, today } from "@/lib/durabo/audio";
import { readRoster } from "@/lib/durabo/io";

// The live transcript as a PDF, for whoever wants the conversation on paper
// or in a mail. Rendered by headless Chrome on this Mac — the same
// shell-out pattern as ffmpeg, and the only PDF writer already installed.
const CHROME_BIN =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const wanted = url.searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? wanted : today();

  const row = readRoster().find((r) => r.slug === slug);
  const transcript = row ? readTranscript(slug, date) : "";
  if (!row || !transcript) {
    return NextResponse.json({ error: "Geen transcript voor deze dag." }, { status: 404 });
  }

  // The file's own markdown header repeats what the PDF header says better.
  const paras = transcript
    .replace(/^# [^\n]*\n+/, "")
    .replace(/^\*[^\n]*\*\n+/, "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
    @page { margin: 22mm 18mm; }
    body { font: 11pt/1.65 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #10131a; }
    header { border-bottom: 2px solid #009b8f; padding-bottom: 10px; margin-bottom: 22px; }
    h1 { font-size: 16pt; margin: 0 0 3px; }
    .meta { color: #5a6172; font-size: 9.5pt; }
    p { margin: 0 0 10px; }
  </style></head><body>
    <header>
      <h1>Interview — ${esc(row.name)}</h1>
      <div class="meta">${esc(row.department ?? "")} · ${esc(date)} ·
        live-transcript, automatisch (whisper) · Granola blijft het transcript van record</div>
    </header>
    ${paras.map((p) => `<p>${esc(p)}</p>`).join("\n")}
  </body></html>`;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "durabo-pdf-"));
  const htmlFile = path.join(tmp, "transcript.html");
  const pdfFile = path.join(tmp, "transcript.pdf");
  try {
    fs.writeFileSync(htmlFile, html, "utf8");
    await run(
      CHROME_BIN,
      ["--headless", "--disable-gpu", `--print-to-pdf=${pdfFile}`, "--no-pdf-header-footer", htmlFile],
      30_000,
    );
    return new NextResponse(fs.readFileSync(pdfFile), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="interview-${slug}-${date}.pdf"`,
      },
    });
  } catch (e) {
    console.error("[durabo pdf]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "PDF kon niet gemaakt worden." }, { status: 500 });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
