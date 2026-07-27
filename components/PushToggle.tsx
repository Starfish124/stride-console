"use client";

import { useEffect, useState } from "react";
import { Working } from "@/components/Loader";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State = "checking" | "unsupported" | "denied" | "off" | "on" | "busy";

/** Draft-ready notifications on this device. One tap on, one tap off. */
export function PushToggle() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const { publicKey } = (await (await fetch("/api/push")).json()) as {
        publicKey: string;
      };
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState("on");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "checking") return null;

  if (state === "unsupported") {
    return (
      <p className="mt-2 text-sm text-slate">
        This browser does not support web push. On iPhone, add the console to
        your Home Screen first: notifications need the installed app.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="mt-2 text-sm text-slate">
        Notifications are blocked for this site in the browser settings. Allow
        them there and come back.
      </p>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-4">
      <p className="flex-1 text-sm text-slate">
        {state === "on"
          ? "This device gets a push when pregen finishes a draft."
          : "Turn this on and pregen tells this device when a draft is ready."}
      </p>
      <button
        onClick={state === "on" ? disable : enable}
        disabled={state === "busy"}
        className={`rounded-input px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
          state === "on"
            ? "border border-ink text-ink hover:bg-paper"
            : "bg-indigo text-white hover:bg-indigo-deep"
        }`}
      >
        {/* Busy always paints as the filled variant, so its loader is on ink. */}
        {state === "busy" ? (
          <Working onDark>One moment.</Working>
        ) : state === "on" ? (
          "Turn off."
        ) : (
          "Turn on."
        )}
      </button>
    </div>
  );
}
