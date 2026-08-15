// Reading the Go bridge's own database.
//
// bridge/whatsapp keeps one SQLite file, store/messages.db, written by the
// whatsmeow client as messages arrive — the same "read someone else's own
// database, never write it" posture bridge/db.mjs already uses for Linked
// Helper. Opened read-only; the bridge is the only writer, and writing
// behind a running client's back is how you corrupt its state.
//
// Two things about this account make "who sent this" and "where do I reply"
// two different questions, not one:
//
// WhatsApp is moving chats onto opaque LIDs (privacy IDs) rather than phone
// numbers — a contact's chat_jid can be "46329862561839@lid" with no visible
// relation to their real number. The Go bridge resolves and stores the real
// number as sender_pn when it can (main.go, StoreMessage); that column is
// what the founder allowlist matches against. chat_jid itself, whichever
// form it takes, is what a reply must be addressed to — sending to the bare
// stripped number would route to the wrong (phone-number) JID server for an
// @lid contact and silently vanish.
//
// The bridge pairs as a linked device on ONE founder's WhatsApp account,
// so a message that account sends to itself ("Message yourself") still
// comes back as is_from_me = 1 — WhatsApp has no concept of "incoming from
// your own other device". The only way that founder reaches the console
// over WhatsApp at all is through that self-chat, so it is treated as
// inbound: an is_from_me = 1 row whose chat_jid resolves to the account's
// own identity (bridge/whatsapp-server.mjs captures both the phone-number
// and LID forms of that identity at connect time).

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "bridge", "whatsapp", "store", "messages.db");
const STATUS_FILE = path.join(process.cwd(), "data", "whatsapp-bridge.json");

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

function bareId(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/**
 * The account's own identity: every form a self-chat might resolve to
 * (for recognising it), and the one form the founder allowlist actually
 * matches against (for reporting who it was).
 */
function ownIdentity(): { forms: Set<string>; number: string | undefined } {
  try {
    const status = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")) as {
      ownNumber?: string;
      ownLid?: string;
    };
    return {
      forms: new Set([status.ownNumber, status.ownLid].filter((v): v is string => Boolean(v))),
      number: status.ownNumber,
    };
  } catch {
    return { forms: new Set(), number: undefined };
  }
}

/**
 * Every message worth the relay's attention since `sinceISO`, oldest first —
 * the order to answer in. That means: a genuine inbound (is_from_me = 0) in
 * a 1:1 chat, or the paired founder talking to their own self-chat. Never
 * throws: no bridge, a busy lock, a half-written row mid-sync all read as
 * "nothing new yet".
 */
export function listInboundSince(sinceISO: string, limit = 50): InboundMessage[] {
  let db: DatabaseSync;
  try {
    db = open();
  } catch {
    return [];
  }
  try {
    const own = ownIdentity();
    // Both directions come out of one query — self-chat rows are is_from_me
    // = 1 — and get told apart in JS, where a Set lookup is simpler than
    // encoding "chat_jid strips to one of N values" back into SQL.
    const rows = db
      .prepare(
        `SELECT id, chat_jid, content, timestamp, is_from_me, sender_pn FROM messages
         WHERE chat_jid NOT LIKE '%@g.us'
           AND content IS NOT NULL AND content != ''
           AND timestamp > ?
         ORDER BY timestamp ASC
         LIMIT ?`,
      )
      .all(sinceISO, limit * 4) as Array<{
      id: string;
      chat_jid: string;
      content: string;
      timestamp: string;
      is_from_me: number;
      sender_pn: string | null;
    }>;

    const out: InboundMessage[] = [];
    for (const r of rows) {
      const chatId = bareId(r.chat_jid);
      const isSelfChat = r.is_from_me === 1 && own.forms.has(chatId);
      const isGenuineInbound = r.is_from_me === 0;
      if (!isSelfChat && !isGenuineInbound) continue;
      out.push({
        id: r.id,
        replyTo: r.chat_jid,
        founderNumber: isSelfChat ? own.number : (r.sender_pn ?? undefined),
        content: r.content,
        timestamp: r.timestamp,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export function messageCount(): number {
  try {
    const db = open();
    const row = db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number };
    db.close();
    return row.n;
  } catch {
    return 0;
  }
}

export function lastInboundAt(): string | undefined {
  try {
    const db = open();
    const row = db
      .prepare("SELECT MAX(timestamp) AS t FROM messages WHERE is_from_me = 0")
      .get() as { t: string | null };
    db.close();
    return row.t ?? undefined;
  } catch {
    return undefined;
  }
}
