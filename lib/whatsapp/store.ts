// Reading the Go bridge's own database.
//
// bridge/whatsapp keeps one SQLite file, store/messages.db, written by the
// whatsmeow client as messages arrive — the same "read someone else's own
// database, never write it" posture bridge/db.mjs already uses for Linked
// Helper. Opened read-only; the bridge is the only writer, and writing
// behind a running client's back is how you corrupt its state.
//
// Everything below is scoped to one chat: config.strideGroupJid(), the
// shared founders' group. That is deliberate consolidation, not an
// oversight — this used to also read a founder's self-chat and any 1:1
// where the sender happened to resolve to a configured founder's number,
// which meant Stride content and a founder's personal messages were told
// apart only by a phone-number allowlist, with no chat-level boundary a
// person could point at. One named group, everyone who should see Stride
// traffic actually in it, is a boundary that holds. No group configured
// means no messages — never falling back to reading everything.
//
// WhatsApp is moving chats onto opaque LIDs (privacy IDs) rather than phone
// numbers — a group member's own JID can be "46329862561839@lid" with no
// visible relation to their real number. The Go bridge resolves and stores
// the real number as sender_pn per message when it can (main.go,
// StoreMessage), for the message's actual author rather than just the
// chat — which is what the founder allowlist matches against and what
// makes per-message attribution work inside a shared group. chat_jid
// itself is what a reply must be addressed to: always the group's own JID
// here, for either direction.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { strideGroupJid } from "./config.ts";

const DB_PATH = path.join(process.cwd(), "bridge", "whatsapp", "store", "messages.db");

export class WhatsAppUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppUnavailable";
  }
}

export interface InboundMessage {
  id: string;
  /** The full JID to reply to — pass straight to sendWhatsApp, unmodified. */
  replyTo: string;
  /** The sender's real phone number, when the bridge could resolve one. */
  founderNumber: string | undefined;
  content: string;
  /** ISO-ish. whatsmeow's own TIMESTAMP text, kept as the database wrote it. */
  timestamp: string;
}

function open(): DatabaseSync {
  if (!fs.existsSync(DB_PATH)) {
    throw new WhatsAppUnavailable("The bridge has not paired yet — no messages.db on disk.");
  }
  // node:sqlite's bundled types do not yet know the { readOnly } overload
  // bridge/db.mjs uses at runtime (plain JS, unchecked). Same file, same
  // intent — this module only ever calls .prepare(...).all()/.get() below,
  // never a write.
  return new DatabaseSync(DB_PATH);
}

/**
 * Every message in the Stride group since `sinceISO`, oldest first — the
 * order to answer in. Both directions count: unlike the old self-chat
 * design, a shared group has no "wrong side" of the conversation. Never
 * throws, and never configured means never anything: no bridge, a busy
 * lock, a half-written row mid-sync, or STRIDE_WHATSAPP_GROUP unset all
 * read as "nothing here".
 */
export function listInboundSince(sinceISO: string, limit = 50): InboundMessage[] {
  const groupJid = strideGroupJid();
  if (!groupJid) return [];

  let db: DatabaseSync;
  try {
    db = open();
  } catch {
    return [];
  }
  try {
    const sinceMs = new Date(sinceISO).getTime();
    // Timestamps in this table are the Go driver's own text format
    // ("2026-08-15 22:55:10+02:00"), not ISO — a lexicographic string
    // comparison against an ISO cursor (the "T" separator sorts differently
    // from " ") silently mismatches, and a relay built on that would miss
    // every message after its first run without ever erroring. Pull a
    // bounded recent window and compare real dates in JS instead of
    // trusting SQL to order two different string shapes the same way.
    const candidatePool = Math.min(Math.max(limit * 40, 800), 4000);
    const rows = db
      .prepare(
        `SELECT id, chat_jid, content, timestamp, sender_pn FROM messages
         WHERE chat_jid = ?
           AND content IS NOT NULL AND content != ''
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(groupJid, candidatePool) as Array<{
      id: string;
      chat_jid: string;
      content: string;
      timestamp: string;
      sender_pn: string | null;
    }>;

    // Newest-first while filtering; reversed to the documented oldest-first
    // order (and trimmed to the most recent `limit`) just before returning.
    const out: InboundMessage[] = [];
    for (const r of rows) {
      const ts = new Date(r.timestamp).getTime();
      if (!Number.isFinite(ts) || ts <= sinceMs) continue;
      out.push({
        id: r.id,
        replyTo: r.chat_jid,
        // `|| undefined`, not `?? undefined`: the Go bridge writes an
        // unresolved sender_pn as "" rather than NULL, and an empty string
        // must collapse to undefined the same as a missing one — founderFor
        // now rejects "" too, but a caller comparing founderNumber directly
        // (=== a real number) should never see a falsy non-undefined value.
        founderNumber: r.sender_pn || undefined,
        content: r.content,
        timestamp: r.timestamp,
      });
      if (out.length >= limit) break;
    }
    // Built newest-first (to let the break above stop early); flipped here
    // to the oldest-first order the relay actually wants to answer in.
    return out.reverse();
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** Messages in the Stride group. 0 when it is not configured. */
export function messageCount(): number {
  const groupJid = strideGroupJid();
  if (!groupJid) return 0;
  try {
    const db = open();
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_jid = ?")
      .get(groupJid) as { n: number };
    db.close();
    return row.n;
  } catch {
    return 0;
  }
}

/** When anyone other than this account last posted in the Stride group. */
export function lastInboundAt(): string | undefined {
  const groupJid = strideGroupJid();
  if (!groupJid) return undefined;
  try {
    const db = open();
    const row = db
      .prepare("SELECT MAX(timestamp) AS t FROM messages WHERE chat_jid = ? AND is_from_me = 0")
      .get(groupJid) as { t: string | null };
    db.close();
    return row.t ?? undefined;
  } catch {
    return undefined;
  }
}
