// The voice, over the Kokoro server this Mac already runs.
//
// No SDK and no model in this repo: JARVIS keeps a warm Kokoro on 7340 as a
// launchd agent, and it is one POST away. Same reasoning as lib/ask/ollama.ts —
// everything stays on this Mac, which is the whole claim the console makes.

const HOST = process.env.KOKORO_HOST ?? "http://127.0.0.1:7340";

/**
 * A British male voice, because the console is read in Dutch offices in English
 * and this one does not turn every statement into a question. The other voices
 * in the bundle are bm_george, bm_lewis and bm_daniel.
 */
const VOICE = process.env.KOKORO_VOICE ?? "bm_fable";
const SPEED = 1.04;
const LANG = "en-gb";

/** Is the voice server up? Same shape as modelReady() so the UI can say so. */
export async function voiceReady(): Promise<{ ok: boolean; problem?: string }> {
  try {
    const res = await fetch(`${HOST}/ping`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, problem: "The voice server answered, but not with a pulse." };
    return { ok: true };
  } catch {
    return { ok: false, problem: "The voice server is not running on this Mac. Nothing will be spoken." };
  }
}

/**
 * One sentence in, 24kHz WAV bytes out.
 *
 * The buffer type is pinned rather than left as ArrayBufferLike so the bytes
 * can be handed straight to a Response without a copy.
 */
export async function speak(text: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(`${HOST}/say`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Measured: a twelve word sentence renders in about two seconds. A whole
    // answer would be a long silence, which is why callers speak sentence by
    // sentence and this only ever sees one.
    signal: signal ?? AbortSignal.timeout(30_000),
    body: JSON.stringify({ text, voice: VOICE, speed: SPEED, lang: LANG }),
  });
  if (!res.ok) throw new Error(`The voice server answered with ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Split streamed text into sentences that are safe to speak, plus the tail that
 * is not finished arriving yet.
 *
 * Callers hold the `rest` and feed it back in with the next chunk.
 *
 * ⚠️ The obvious version — split on every period — mangles the client book.
 * "Durabo B.V." and "HIT Trading B.V." are real names here, and an initial
 * spoken as a sentence break reads as a stutter. So a period only ends a
 * sentence when what precedes it is not a lone capital and what follows is a
 * space then a capital, or the end of the text.
 */
export function splitSpeakable(text: string): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;

    // "B.V." and "e.g." — look at the word the dot is attached to. A single
    // letter is an initial, and a word that already contains a dot is an
    // abbreviation still being spelled out. Neither ends a sentence.
    //
    // Checking the character before the dot is not enough: in "B.V." the V is
    // preceded by a dot rather than a space, so the naive lookbehind splits the
    // name in half and the voice says "Durabo B.V." as two sentences.
    if (ch === ".") {
      const word = text.slice(start, i).split(/[\s(]/).pop() ?? "";
      if (word.includes(".") || /^[A-Za-z]$/.test(word)) continue;
    }

    // Run past "?!" and closing quotes or brackets so they stay with the sentence.
    let end = i;
    while (end + 1 < text.length && /[.!?"')\]]/.test(text[end + 1])) end++;

    const after = text.slice(end + 1);
    // Nothing after it yet: the sentence may still be growing, so hold it.
    if (after.length === 0) break;
    // A sentence ends when whitespace follows. Anything else — a digit, a
    // letter — means this was a decimal or an abbreviation.
    if (!/^\s/.test(after)) continue;

    const sentence = text.slice(start, end + 1).trim();
    if (sentence) ready.push(sentence);
    start = end + 1;
  }

  return { ready, rest: text.slice(start) };
}
