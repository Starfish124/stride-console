import { NextResponse } from "next/server";
import { speak, voiceReady } from "@/lib/speech/kokoro";

export const dynamic = "force-dynamic";

/** Is there a voice on this machine at all? */
export async function GET() {
  return NextResponse.json(await voiceReady());
}

/**
 * One sentence in, spoken audio out.
 *
 * Sentence at a time rather than whole answers: Kokoro renders the entire
 * utterance before it returns a single byte, so asking it for a paragraph buys
 * a long silence. The client speaks each sentence as the model finishes it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  }
  // A whole answer pasted in would tie up the voice server for a minute.
  if (text.length > 1000) {
    return NextResponse.json({ error: "Too long to speak in one go." }, { status: 413 });
  }

  const ready = await voiceReady();
  if (!ready.ok) {
    return NextResponse.json({ error: ready.problem }, { status: 503 });
  }

  try {
    const wav = await speak(text);
    return new NextResponse(wav, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The voice server stopped.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
