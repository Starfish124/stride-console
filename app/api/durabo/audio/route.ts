import { NextResponse } from "next/server";
import { concatSegments, readTranscript, saveSegment, transcribeSegment } from "@/lib/durabo/audio";

// One recorded segment in, its words out. The phone posts the raw blob;
// nothing here is a form. Audio and transcript live under data/ on this Mac.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const action = url.searchParams.get("action") ?? "segment";

  try {
    if (action === "finish") {
      const file = await concatSegments(slug);
      return NextResponse.json({ ok: true, file: file ?? null });
    }
    const seq = Number(url.searchParams.get("seq") ?? "0");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length < 1000) return NextResponse.json({ error: "Empty segment." }, { status: 400 });
    saveSegment(slug, seq, request.headers.get("content-type") ?? "", bytes);
    const text = await transcribeSegment(slug, bytes);
    return NextResponse.json({ seq, text, transcript: readTranscript(slug) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "";
    // The one failure a founder can act on mid-interview is "model missing";
    // the rest logs here and reads as a skipped segment on the phone.
    console.error("[durabo audio]", detail);
    return NextResponse.json({ error: "Segment kon niet verwerkt worden." }, { status: 500 });
  }
}
