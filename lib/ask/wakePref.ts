"use client";

import { useSyncExternalStore } from "react";

// Whether this browser listens for "Stride" in the background. A personal,
// per-device preference — not a server setting, not shared between founders
// — so localStorage is the whole store.
//
// useWakePref() rather than a plain useState+useEffect read: the value the
// server rendered (it has no localStorage, so always "off") must match the
// client's very first render or React logs a hydration mismatch, and
// useSyncExternalStore is the hook that exists specifically to read a
// mutable external store safely across that boundary — a getServerSnapshot
// that always says "off", and a real subscription so Settings toggling the
// pref updates the layout-mounted listener on the same page immediately
// (the "storage" event alone only ever fires in *other* tabs).

const KEY = "stride-voice-wake";
const EVENT = "stride-voice-wake-changed";

export function getWakePref(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "on";
}

export function setWakePref(on: boolean): void {
  window.localStorage.setItem(KEY, on ? "on" : "off");
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useWakePref(): boolean {
  return useSyncExternalStore(subscribe, getWakePref, () => false);
}
