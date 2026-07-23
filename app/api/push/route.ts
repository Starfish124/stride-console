import { NextResponse } from "next/server";
import { addPushSub, listPushSubs, removePushSub } from "@/lib/store";
import { vapidPublicKey } from "@/lib/push";

/** The public VAPID key plus how many phones are subscribed. */
export async function GET() {
  return NextResponse.json({
    publicKey: vapidPublicKey(),
    subscriptions: listPushSubs().length,
  });
}

/** Save a phone's push subscription. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "A full subscription required." }, { status: 400 });
  }
  addPushSub({
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

/** Forget a subscription when a founder turns notifications off. */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint required." }, { status: 400 });
  }
  removePushSub(body.endpoint);
  return NextResponse.json({ ok: true });
}
