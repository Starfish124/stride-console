// Who is allowed to talk to the console over WhatsApp, and how to reach them.
//
// WhatsApp has no equivalent of the console's own login — anyone with a
// founder's number in their contacts could message the bridge's number. The
// allowlist is the whole security model here: a message from an unlisted
// number is read, logged, and never answered. Silently, not with a bounce —
// telling a stranger "you are not authorised" confirms the number is real
// and staffed, which is worse than saying nothing.

export interface FounderContact {
  /** E.164 without the plus, matching whatsmeow's own JID user part. */
  number: string;
  name: string;
}

const RAW = process.env.STRIDE_WHATSAPP_FOUNDERS ?? "";

/**
 * The one WhatsApp chat the console treats as its channel: brain ingestion,
 * the calendar's signals panel, and the relay's listen/reply loop all read
 * this chat and nothing else. Consolidated on purpose — a founder's other
 * 1:1s and self-chat used to count too, which meant Stride content mixed
 * with personal chat with no way to tell the two apart from a phone number
 * alone. One named group, shared by every founder who should see it, is a
 * boundary a person can actually reason about.
 */
export function strideGroupJid(): string | undefined {
  return process.env.STRIDE_WHATSAPP_GROUP || undefined;
}

/**
 * "31634114311:Jort,31612345678:Sarvesh" — set once in .env.local. Empty
 * until configured, which means the relay answers nobody rather than
 * guessing who a founder is.
 */
export function founderContacts(): FounderContact[] {
  return RAW.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [number, name] = entry.split(":");
      return { number: (number ?? "").replace(/\D/g, ""), name: (name ?? "Founder").trim() };
    })
    .filter((c) => c.number.length >= 8);
}

export function founderFor(jidOrNumber: string): FounderContact | undefined {
  const digits = jidOrNumber.replace(/\D/g, "");
  // Empty input must never match. c.number.endsWith("") is true for any
  // string — an unresolved sender (empty jidOrNumber, or a JID that strips
  // to no digits at all) would otherwise silently match the first
  // configured founder and be treated as authorised.
  if (!digits) return undefined;
  return founderContacts().find((c) => digits.endsWith(c.number) || c.number.endsWith(digits));
}

export function isAuthorizedFounder(jidOrNumber: string): boolean {
  return founderFor(jidOrNumber) !== undefined;
}
