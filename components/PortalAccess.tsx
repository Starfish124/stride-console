"use client";

import { useEffect, useState } from "react";

/**
 * The founder's controls for a client's portal link. Deliberately small:
 * see the link, copy it, mint a fresh one, or kill it. The link itself is
 * the credential, which is why revoke sits right next to copy.
 */
export function PortalAccess({ clientId }: { clientId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stale = false;
    fetch(`/api/portal?clientId=${encodeURIComponent(clientId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ url: string | null }>) : null))
      .then((data) => {
        if (stale) return;
        if (data) setUrl(data.url);
        setLoaded(true);
      })
      .catch(() => {
        if (!stale) setLoaded(true);
      });
    return () => {
      stale = true;
    };
  }, [clientId]);

  async function act(action: "mint" | "revoke") {
    const res = await fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, action }),
    });
    if (!res.ok) return;
    // Mint answers with the fresh link; revoke means there is none. Either
    // way the response tells us the new state, so no refetch.
    const data = (await res.json()) as { url?: string };
    setUrl(action === "mint" ? (data.url ?? null) : null);
    setCopied(false);
  }

  async function copy() {
    if (!url) return;
    // The API hands back a relative path; the founder's own origin makes it
    // a link somebody else can open.
    await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (!loaded) return null;

  const button =
    "pressable rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-semibold";

  return url ? (
    <div>
      <p className="truncate text-[13px] text-slate">{url}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className={`${button} text-indigo hover:border-indigo/30`}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => act("revoke")}
          className={`${button} text-slate hover:text-amber`}
        >
          Revoke
        </button>
      </div>
    </div>
  ) : (
    <div>
      <p className="text-[13px] leading-snug text-slate">
        A read-only page showing this client their own engagement. The link is
        the key: anyone holding it can open it.
      </p>
      <button
        type="button"
        onClick={() => act("mint")}
        className={`${button} mt-2 text-indigo hover:border-indigo/30`}
      >
        Create portal link
      </button>
    </div>
  );
}
