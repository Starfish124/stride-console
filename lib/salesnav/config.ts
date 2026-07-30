// What the sequencer is allowed to do, read from the environment only.
//
// Default off, and off means a full dry run rather than a dead button: a fresh
// checkout with no environment at all runs the whole sequencer, writes complete
// send records with the exact subject and body, and sends nothing. A founder
// can read what would have gone out before deciding to let it go out.
//
// Nothing here is written to data/. A key never lands on disk.

const DEFAULTS = {
  dailyCap: 40,
  domainCap: 3,
  window: "08:00-17:30",
  days: "1,2,3,4,5",
  maxLateDays: 3,
  /** Per tick, so a catch-up after a long sleep leaves as a trickle. */
  perTick: 3,
  /** Up to this many minutes are added when scheduling the next step. */
  jitterMinutes: 37,
} as const;

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function publicUrl(): string {
  return (process.env.SALESNAV_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
}

export function consoleUrl(): string {
  return (process.env.SALESNAV_CONSOLE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
}

export function fromAddress(): string {
  return (process.env.SALESNAV_FROM ?? "").trim();
}

export function replyTo(): string {
  return (process.env.SALESNAV_REPLY_TO ?? "").trim();
}

/**
 * Live requires all four, not just the flag.
 *
 * The https public URL is not decoration. Every message carries an unsubscribe
 * link, and a link pointing at 127.0.0.1 is a promise that cannot be kept, so
 * live mode refuses to exist without an address the recipient can actually
 * reach.
 */
export function salesnavMode(): "dry" | "live" {
  const url = publicUrl();
  const ok =
    process.env.STRIDE_SALESNAV === "live" &&
    !!process.env.RESEND_API_KEY &&
    !!fromAddress() &&
    url.startsWith("https://");
  return ok ? "live" : "dry";
}

/** What is missing, in the order a founder should fix it. */
export function liveBlockers(): string[] {
  const missing: string[] = [];
  if (process.env.STRIDE_SALESNAV !== "live") missing.push("STRIDE_SALESNAV=live");
  if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!fromAddress()) missing.push("SALESNAV_FROM");
  if (!publicUrl().startsWith("https://")) missing.push("SALESNAV_PUBLIC_URL (https)");
  return missing;
}

/** Throw a sentence that says what to set, not that something was undefined. */
export function assertLive(): void {
  if (salesnavMode() === "live") return;
  throw new Error(
    `Live sending is off. Set ${liveBlockers().join(", ")} and restart the console.`,
  );
}

export function dailyCap(): number {
  return num("SALESNAV_DAILY_CAP", DEFAULTS.dailyCap);
}

export function domainCap(): number {
  return num("SALESNAV_DOMAIN_CAP", DEFAULTS.domainCap);
}

export function maxLateDays(): number {
  return num("SALESNAV_MAX_LATE_DAYS", DEFAULTS.maxLateDays);
}

export function perTick(): number {
  return num("SALESNAV_PER_TICK", DEFAULTS.perTick);
}

export function jitterMinutes(): number {
  return num("SALESNAV_JITTER_MINUTES", DEFAULTS.jitterMinutes);
}

export interface SendWindow {
  startMinutes: number;
  endMinutes: number;
  days: number[];
  label: string;
}

/** "08:00-17:30" as minutes past local midnight. A bad value falls back. */
export function sendWindow(): SendWindow {
  const raw = (process.env.SALESNAV_WINDOW ?? DEFAULTS.window).trim();
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw);
  const label = m ? raw : DEFAULTS.window;
  const [sh, sm, eh, em] = m
    ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
    : [8, 0, 17, 30];

  const dayRaw = (process.env.SALESNAV_DAYS ?? DEFAULTS.days).split(",");
  const days = dayRaw
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  return {
    startMinutes: sh * 60 + sm,
    endMinutes: eh * 60 + em,
    days: days.length ? days : [1, 2, 3, 4, 5],
    label,
  };
}

/**
 * The local calendar day, not UTC.
 *
 * A cap that rolls over at 02:00 local is a cap that quietly lets a second
 * day's worth of email out overnight. Same shape as scripts/agents.mjs.
 */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------- the clock, as pure functions ----------
//
// These live next to the settings they read rather than in runner.ts, so that
// send.ts can schedule the next step without the runner and the sender having
// to import each other.

/** Local time, and a weekend is not a sending day. */
export function withinWindow(now: Date, window: SendWindow = sendWindow()): boolean {
  if (!window.days.includes(now.getDay())) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= window.startMinutes && minutes < window.endMinutes;
}

/**
 * A step this far past its due date has lost its context.
 *
 * After a week of the Mac being asleep, catching up on the clock would fire
 * last Tuesday's opener at somebody today, referring to something that has
 * moved on. Better to skip it and say so.
 */
export function isTooLate(dueAt: string, now: Date, lateDays: number = maxLateDays()): boolean {
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return false;
  return now.getTime() - due > lateDays * 86_400_000;
}

/**
 * When the next step is due, with jitter.
 *
 * Without the jitter a catch-up batch leaves on the same second, which is both
 * a spam signal and a thing that looks like a machine to anybody comparing
 * notes with a colleague.
 */
export function nextDueAt(from: Date, waitDays: number, random: () => number = Math.random): string {
  const jitter = Math.floor(random() * (jitterMinutes() + 1));
  return new Date(from.getTime() + waitDays * 86_400_000 + jitter * 60_000).toISOString();
}
