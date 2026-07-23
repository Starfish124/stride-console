"use client";

import { useEffect } from "react";

/** Registers the service worker once per load. Silent when unsupported. */
export function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An old browser without service workers still gets the full console.
      });
    }
  }, []);
  return null;
}
