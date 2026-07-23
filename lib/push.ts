// Self-hosted web push. VAPID keys generate themselves on first use and live in
// data/ next to everything else; delivery uses the browser vendors' own push
// endpoints and nothing else. Pushes announce drafts — they never contain them.

import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { DATA_DIR, listPushSubs, removePushSub } from "./store.ts";

const KEYS_FILE = path.join(DATA_DIR, "push-keys.json");

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cachedKeys: VapidKeys | undefined;

export function ensureVapidKeys(): VapidKeys {
  if (cachedKeys) return cachedKeys;
  try {
    cachedKeys = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")) as VapidKeys;
    return cachedKeys;
  } catch {
    // First run: generate and keep them.
  }
  const generated = webpush.generateVAPIDKeys();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(generated, null, 2), "utf8");
  cachedKeys = generated;
  return cachedKeys;
}

export function vapidPublicKey(): string {
  return ensureVapidKeys().publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Send to every subscribed phone. Dead subscriptions clean themselves up. */
export async function sendToAll(
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  const subs = listPushSubs();
  if (subs.length === 0) return { sent: 0, removed: 0 };
  const keys = ensureVapidKeys();
  webpush.setVapidDetails("mailto:founders@stride-ai.local", keys.publicKey, keys.privateKey);
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        removePushSub(sub.endpoint);
        removed++;
      }
    }
  }
  return { sent, removed };
}
