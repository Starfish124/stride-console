// Sending, through the Go bridge's own REST endpoint.
//
// The bridge is loopback-only (bridge/whatsapp/main.go, patched) and speaks
// one route worth using here: POST /api/send {recipient, message}. No
// dependency, one fetch — the same shape as lib/ask/ollama.ts's "no SDK, one
// POST" rule, for the same reason: this is one call, not an integration.

// 8765, not the bridge's upstream default 8080 — that port is already
// Durabo's Map/serve.py on this Mac, and the Go bridge was patched to bind
// its own instead of fighting over one it never claimed first.
const BRIDGE_URL = process.env.STRIDE_WHATSAPP_BRIDGE_URL ?? "http://127.0.0.1:8765";
const TIMEOUT_MS = 15_000;

export interface SendResult {
  ok: boolean;
  problem?: string;
}

/**
 * `recipient` is a bare number ("31612345678") or a full JID. Never throws —
 * a WhatsApp send failing must not take down whatever triggered it, the same
 * rule sendToAll already holds for web push.
 */
export async function sendWhatsApp(recipient: string, message: string): Promise<SendResult> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient, message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!res.ok || !body.success) {
      return { ok: false, problem: body.message ?? `The bridge answered with ${res.status}.` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, problem: err instanceof Error ? err.message : "The bridge did not answer." };
  }
}

/** One message, every authorised founder. Used for proactive pings. */
export async function sendWhatsAppToFounders(message: string): Promise<void> {
  const { founderContacts } = await import("./config.ts");
  for (const founder of founderContacts()) {
    await sendWhatsApp(founder.number, message);
  }
}
