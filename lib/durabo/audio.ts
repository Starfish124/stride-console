// Interview audio, on this Mac and nowhere else.
//
// The phone records in short standalone segments (iOS Safari cannot produce a
// decodable mid-stream chunk, so the recorder restarts per segment). Each
// segment lands here, gets transcribed in Dutch, and grows a transcript file.
// This transcript is the LIVE working feed — Granola stays the transcript of
// record in raw-transcripts/, per the engagement's own rules.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR } from "../store.ts";
import { transcribe } from "../speech/whisper.ts";
import { requireSlug } from "./io.ts";

const FFMPEG_BIN = process.env.FFMPEG_BIN ?? "/usr/local/bin/ffmpeg";

/** Multilingual model for Dutch. base.en (the Ask Stride default) mangles it. */
export const DUTCH_MODEL =
  process.env.DURABO_WHISPER_MODEL ??
  path.join(os.homedir(), ".config/deck/jarvis/models/ggml-large-v3-turbo.bin");

export function audioDir(slug: string, date = today()): string {
  requireSlug(slug);
  return path.join(DATA_DIR, "durabo-audio", slug, date);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// 5 digits: seq is seconds-since-midnight (max 86399), and a 4-digit pad
// would sort an evening segment before a morning one.
const seg = (n: number, ext: string) => `seg-${String(n).padStart(5, "0")}.${ext}`;

/** Store one recorded segment and return its path. seq keeps phone order. */
export function saveSegment(slug: string, seq: number, mime: string, bytes: Uint8Array): string {
  const dir = audioDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "m4a";
  const file = path.join(dir, seg(seq, ext));
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  return file;
}

export function transcriptFile(slug: string, date = today()): string {
  return path.join(audioDir(slug, date), "transcript.md");
}

export function readTranscript(slug: string, date = today()): string {
  try {
    return fs.readFileSync(transcriptFile(slug, date), "utf8");
  } catch {
    return "";
  }
}

/** Transcribe one segment (Dutch) and append what it heard. Returns the text. */
export async function transcribeSegment(slug: string, bytes: Uint8Array): Promise<string> {
  const text = await transcribe(bytes, { language: "nl", model: DUTCH_MODEL });
  if (!text) return "";
  const file = transcriptFile(slug);
  let block = `${text}\n\n`;
  if (!fs.existsSync(file)) {
    block =
      `# Live transcript (app) — ${slug}, ${today()}\n\n` +
      `*Automatisch, whisper op de Mac. Granola blijft het transcript van record.*\n\n` +
      block;
  }
  fs.appendFileSync(file, block, "utf8");
  return text;
}

export function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(err).toString("utf8").trim() || `${path.basename(bin)} exited ${code}.`));
    });
  });
}

/**
 * Join the day's segments into one listenable file. Re-encoded rather than
 * stream-copied so a day that mixed containers still concatenates.
 */
export async function concatSegments(slug: string, date = today()): Promise<string | undefined> {
  const dir = audioDir(slug, date);
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith("seg-")).sort();
  } catch {
    return undefined;
  }
  if (files.length === 0) return undefined;
  const list = path.join(dir, "segments.txt");
  fs.writeFileSync(list, files.map((f) => `file '${path.join(dir, f)}'`).join("\n"), "utf8");
  const out = path.join(dir, "interview.m4a");
  await run(
    FFMPEG_BIN,
    ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-ar", "44100", "-ac", "1", "-c:a", "aac", out],
    120_000,
  );
  return out;
}
