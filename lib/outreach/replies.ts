// Replies coming back from the people we wrote to.
//
// The return leg: the machine that writes the outbound finally learns which
// openers got answered. Replies arrive from the email provider's webhook
// (app/api/hooks/resend), and a founder can record a LinkedIn answer by hand.
//
// Two things shape this file.
//
// The payload is not ours. A provider's exact shape is undocumented and
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
/** Keep the log bounded; this is an inbox, not an archive. */
const MAX_REPLIES = 2000;

export interface Reply {
  id: string;
  receivedAt: string;
  /** "replied", "connected", "person" — whatever the sender called it. */
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

/** First present value among several possible key spellings. */
function pick(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** Flatten one level, since senders nest person data under varying parents. */
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
