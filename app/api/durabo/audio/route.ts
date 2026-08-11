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
    // The audio is on disk from here on. A whisper hiccup must NOT read as a
    // failed upload — the phone would resend and duplicate the segment — so
    // transcription failure is a 200 with empty text and the words are
    // recoverable later from the saved file.
    let text = "";
    try {
      text = await transcribeSegment(slug, bytes);
    } catch (e) {
      console.error("[durabo transcribe]", e instanceof Error ? e.message : e);
    }
    return NextResponse.json({ seq, text, transcript: readTranscript(slug) });
  } catch (e) {
    console.error("[durabo audio]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Segment kon niet opgeslagen worden." }, { status: 500 });
  }
}
