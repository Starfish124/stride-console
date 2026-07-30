import { NextResponse } from "next/server";
import { earsReady, transcribe } from "@/lib/speech/whisper";

export const dynamic = "force-dynamic";

/** Twenty megabytes is minutes of speech. Past that, something else is going on. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Can this machine hear? */
export async function GET() {
  return NextResponse.json(earsReady());
}

/**
 * A recording in, words out.
 *
 * The body is the raw audio the browser recorded, whatever container it chose
 * — iOS Safari gives mp4, Chrome gives webm/opus. It is never named, written
 * to a path built from user input, or passed through a shell.
 *
 * This route is not in the public allowlist in proxy.ts, and must not be: it
 * accepts an upload and spends real CPU on it.
 */
export async function POST(request: Request) {
  const audio = new Uint8Array(await request.arrayBuffer());

  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "Nothing was recorded." }, { status: 400 });
  }
  if (audio.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long." }, { status: 413 });
  }

  const ready = earsReady();
  if (!ready.ok) {
    return NextResponse.json({ error: ready.problem }, { status: 503 });
  }

  try {
    const text = await transcribe(audio);
    // Empty is a real answer: whisper invents words for silence, so the caller
    // is told nothing was said rather than handed a hallucination to ask about.
    return NextResponse.json({ text });
  } catch (err) {
    // ffmpeg reports a bad file by quoting the path it was given, which is a
    // temp path on this Mac. The console already had one absolute home path
    // reach the screen; it is not doing that again for a recording that simply
    // did not decode. The detail goes to the log, the caller gets the fact.
    console.error("speech/hear:", err);
    return NextResponse.json({ error: "That recording could not be read." }, { status: 502 });
  }
}
