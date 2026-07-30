import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { allowRequest } from "@/lib/rateLimit";
import { recordReply } from "@/lib/outreach/replies";
import { suppress } from "@/lib/salesnav/suppress";
import { listSends, putSend } from "@/lib/salesnav/store";

export const dynamic = "force-dynamic";

/**
 * Where Resend reports back: bounces, complaints, deliveries.
 *
 * Public by necessity, so the signature is the only guard and it is checked
 * before anything is read. Svix signs `${id}.${timestamp}.${rawBody}` with the
 * base64 half of whsec_..., which is about twenty lines of node:crypto. The
 * svix package would be a dependency to carry forever for exactly this, so it
 * is skipped deliberately.
 *
 * A bad signature gets a 404 with no explanation, the same as the Linked
 * Helper hook, so a caller learns nothing about why a guess failed.
 */
const TOLERANCE_SECONDS = 5 * 60;

function verify(raw: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatures) return false;

  // A replayed payload from a month ago must not be able to suppress anybody.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.split("whsec_").pop() ?? "", "base64");
  if (!key.length) return false;

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest();

  for (const entry of signatures.split(" ")) {
    const offered = Buffer.from(entry.split(",").pop() ?? "", "base64");
    if (offered.length === expected.length && crypto.timingSafeEqual(offered, expected)) return true;
  }
  return false;
}

/** A delivery confirmation is what closes a row whose outcome was unknown. */
function settle(providerId: string | undefined): void {
  if (!providerId) return;
  const record = listSends().find((s) => s.providerId === providerId);
  if (record && record.state === "sending") {
    putSend({ ...record, state: "sent", finishedAt: new Date().toISOString() });
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Rate limit first, whether or not the signature is right. Note the argument
  // order: allowRequest(ip, now, max, windowMs).
  if (!allowRequest(`hook:${ip}`, Date.now(), 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const raw = await request.text();
  if (!verify(raw, request.headers)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> };
  } catch {
    recordReply({ unparsed: raw }, "email");
    return NextResponse.json({ ok: true });
  }

  const data = event.data ?? {};
  const to = Array.isArray(data.to) ? String(data.to[0] ?? "") : String(data.to ?? "");
  const providerId = typeof data.email_id === "string" ? data.email_id : undefined;

  switch (event.type) {
    case "email.bounced": {
      const bounce = (data.bounce ?? {}) as { type?: string };
      // A soft bounce is a full mailbox, not a wrong address. Only a hard one
      // is a permanent fact about the person.
      if (to && /hard|permanent/i.test(bounce.type ?? "hard")) {
        suppress({ address: to, reason: "bounced", by: "resend", note: bounce.type });
      }
      break;
    }
    case "email.complained":
      if (to) suppress({ address: to, reason: "complained", by: "resend" });
      break;
    case "email.delivered":
    case "email.sent":
      settle(providerId);
      break;
    // Everything else Resend emits about a message WE sent is telemetry, not a
    // person writing back. Recording these as replies was actively harmful:
    // hasReplied() matches an address anywhere in the stored payload, and a
    // delivery_delayed carries data.to, so a greylisting mail server looked
    // exactly like an answer. The sequence stopped for good, the dashboard
    // showed a reply with no message, and the mail was delivered minutes later.
    case "email.delivery_delayed":
    case "email.failed":
    case "email.scheduled":
    case "email.opened":
    case "email.clicked":
      break;

    default:
      // A genuinely unknown type is kept rather than dropped, because losing a
      // real reply because a key was renamed is the worse failure. Anything
      // Resend adds about our own outbound belongs in the case list above.
      recordReply(event, "email");
  }

  return NextResponse.json({ ok: true });
}
