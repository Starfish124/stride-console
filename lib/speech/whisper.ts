// Speech in, over whisper.cpp — which is already on this Mac.
//
// Deliberately NOT the ears server on 7341. That one owns the Mac's microphone
// through a long-lived ffmpeg capture, for JARVIS listening in the room. What
// the console needs is the opposite: audio recorded on a founder's phone,
// arriving over the Funnel. Different job, so whisper-cli is spawned per
// request. Measured at half a second for a sentence, model load included.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const WHISPER_BIN = process.env.WHISPER_BIN ?? "/opt/homebrew/bin/whisper-cli";
const WHISPER_MODEL =
  process.env.WHISPER_MODEL ??
  path.join(os.homedir(), ".config/deck/jarvis/models/ggml-base.en.bin");
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? "/usr/local/bin/ffmpeg";

/** Are the binaries and the model actually there? Same shape as modelReady(). */
export function earsReady(): { ok: boolean; problem?: string } {
  if (!existsSync(FFMPEG_BIN)) return { ok: false, problem: "ffmpeg is not installed, so recordings cannot be read." };
  if (!existsSync(WHISPER_BIN)) return { ok: false, problem: "whisper is not installed on this Mac." };
  if (!existsSync(WHISPER_MODEL)) return { ok: false, problem: "The whisper model is missing, so nothing can be transcribed." };
  return { ok: true };
}

/**
 * What whisper says when it heard nothing.
 *
 * On silence it does not return an empty string, it invents. Two seconds of
 * digital silence through the base model returns "you". Left alone, tapping the
 * microphone and saying nothing sends the model a question about "you", which
 * is a strange thing to watch happen in front of a client.
 */
const HEARD_NOTHING = new Set([
  "you",
  "thank you",
  "thanks for watching",
  "thanks for watching!",
  "bye",
  "so",
  ".",
]);

/**
 * What multilingual whisper invents on Dutch silence: subtitle credits.
 * The Amara line is the canonical one; anything crediting subtitlers is noise.
 */
const DUTCH_NOISE = /ondertitel(s|d|ing)?[^.]*(amara|gemeenschap|ingediend|door)|amara\.org/i;

/** Trim whisper's output, and report silence as silence. */
export function cleanTranscript(raw: string): string {
  const text = raw
    // [BLANK_AUDIO], (upbeat music) and the rest of its stage directions.
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const bare = text.toLowerCase().replace(/[.!?,]+$/, "").trim();
  if (bare.length === 0 || HEARD_NOTHING.has(bare) || DUTCH_NOISE.test(bare)) return "";
  // Pure tones and hums come back as strings of asterisks or dashes — output
  // with no letter in it was not speech.
  if (!/\p{L}/u.test(bare)) return "";
  return text;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Array args, never a shell string: this input arrives over the network.
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out).toString("utf8"));
      else reject(new Error(Buffer.concat(err).toString("utf8").trim() || `${path.basename(bin)} exited ${code}.`));
    });
  });
}

/**
 * Recorded audio in, words out.
 *
 * The container is whatever the browser chose — iOS Safari records audio/mp4,
 * Chrome records webm/opus — so ffmpeg is asked to work it out rather than
 * being told. whisper wants 16kHz mono either way.
 */
export async function transcribe(
  audio: Uint8Array,
  opts: { language?: string; model?: string } = {},
): Promise<string> {
  const ready = earsReady();
  if (!ready.ok) throw new Error(ready.problem);
  const model = opts.model ?? WHISPER_MODEL;
  if (opts.model && !existsSync(opts.model)) throw new Error("The requested whisper model is missing.");

  const stem = path.join(os.tmpdir(), `stride-hear-${randomUUID()}`);
  const upload = `${stem}.upload`;
  const wav = `${stem}.wav`;

  try {
    await writeFile(upload, audio, { mode: 0o600 });
    await run(FFMPEG_BIN, ["-v", "error", "-y", "-i", upload, "-ar", "16000", "-ac", "1", "-f", "wav", wav], 30_000);
    const raw = await run(
      WHISPER_BIN,
      [
        "-m", model,
        "-f", wav,
        "-nt", // no timestamps, just the words
        "-np", // no progress banner on stderr
        "--language", opts.language ?? "en",
      ],
      60_000,
    );
    return cleanTranscript(raw);
  } finally {
    // Someone's voice: do not leave it in /tmp because a step above threw.
    await Promise.all([unlink(upload).catch(() => {}), unlink(wav).catch(() => {})]);
  }
}
