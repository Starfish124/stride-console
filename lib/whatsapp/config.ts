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
  return founderContacts().find((c) => digits.endsWith(c.number) || c.number.endsWith(digits));
}

export function isAuthorizedFounder(jidOrNumber: string): boolean {
  return founderFor(jidOrNumber) !== undefined;
}
