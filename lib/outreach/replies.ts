// Replies coming back from Linked Helper.
//
// LH2 can call a webhook as a campaign step, including when someone answers
// (sendRepliedToWebhook). That is the return leg the console never had: the
// machine that writes the outbound finally learns which openers got answered.
//
// Two things shape this file.
//
// The payload is not ours. Linked Helper's exact shape is undocumented and
// changes between versions, so nothing here insists on a schema. Known fields
// are read where present, the whole body is kept verbatim, and an unrecognised
// payload is stored rather than dropped. Losing a real reply because a key was
// renamed would be the worst possible failure here.
//
// The contents are somebody else's words. A reply is personal data about a
// real person who wrote to a founder. It stays on this Mac in gitignored
// data/, and nothing here forwards it anywhere.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../store.ts";

const FILE = path.join(DATA_DIR, "replies.json");
const SECRET_FILE = path.join(DATA_DIR, "hooks.json");

/** Keep the log bounded; this is an inbox, not an archive. */
const MAX_REPLIES = 2000;

export interface Reply {
  id: string;
  receivedAt: string;
  /** "replied", "connected", "person" — whatever LH2 said the event was. */
  event: string;
  /**
   * Which way it came in. Optional so every record written before email
   * existed still reads, and so there is one inbox rather than two.
   */
  channel?: "linkedin" | "email";
  name: string | null;
  headline: string | null;
  profileUrl: string | null;
  company: string | null;
  /** What they actually wrote, when the payload carries it. */
  message: string | null;
  campaign: string | null;
  handled: boolean;
  /** The untouched payload, so a renamed key is recoverable later. */
  raw: unknown;
}

function read(): Reply[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Reply[];
  } catch {
    return [];
  }
}

function write(all: Reply[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

/**
 * The shared secret that makes the webhook URL unguessable. The console is
 * public over Funnel, so this endpoint is reachable from the internet and the
 * secret is the only thing standing in front of it.
 */
export function webhookSecret(): string {
  try {
    const existing = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as { secret?: string };
    if (typeof existing.secret === "string" && existing.secret.length >= 32) return existing.secret;
  } catch {
    // First call, or the file was damaged. Mint below.
  }
  const secret = crypto.randomBytes(24).toString("base64url");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SECRET_FILE, `${JSON.stringify({ secret }, null, 2)}\n`, { mode: 0o600 });
  return secret;
}

export function secretMatches(offered: string | null): boolean {
  if (!offered) return false;
  const a = Buffer.from(offered);
  const b = Buffer.from(webhookSecret());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** First present value among several possible key spellings. */
function pick(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** Flatten one level, since LH2 nests person data under varying parents. */
function flatten(body: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...body };
  for (const [key, value] of Object.entries(body)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (!(k in flat)) flat[k] = v;
        flat[`${key}.${k}`] = v;
      }
    }
  }
  return flat;
}

export function recordReply(body: unknown, channel: "linkedin" | "email" = "linkedin"): Reply {
  const object = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const flat = flatten(object);

  const first = pick(flat, ["first_name", "firstName", "firstname"]);
  const last = pick(flat, ["last_name", "lastName", "lastname"]);
  const full = pick(flat, ["name", "full_name", "fullName"]);

  const reply: Reply = {
    id: `rep_${crypto.randomBytes(6).toString("hex")}`,
    receivedAt: new Date().toISOString(),
    event: pick(flat, ["event", "type", "action", "hook", "trigger"]) ?? "unknown",
    channel,
    name: full ?? [first, last].filter(Boolean).join(" ") ?? null,
    headline: pick(flat, ["headline", "title", "position", "occupation"]),
    profileUrl: pick(flat, ["profile_url", "profileUrl", "url", "link", "public_profile_url"]),
    company: pick(flat, ["company", "company_name", "companyName", "organization"]),
    message: pick(flat, ["message", "text", "reply", "reply_text", "last_message", "body"]),
    campaign: pick(flat, ["campaign", "campaign_name", "campaignName"]),
    handled: false,
    raw: body,
  };
  if (reply.name === "") reply.name = null;

  const all = [reply, ...read()].slice(0, MAX_REPLIES);
  write(all);
  return reply;
}

export function listReplies(): Reply[] {
  return read();
}

export function markHandled(id: string, handled = true): void {
  write(read().map((r) => (r.id === id ? { ...r, handled } : r)));
}

export function unhandledCount(): number {
  return read().filter((r) => !r.handled).length;
}
