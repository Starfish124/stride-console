// Stride Console service worker: offline shell + self-hosted web push.
// No external push service beyond the browser's own delivery.

const CACHE = "stride-shell-v1";
const SHELL = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * How long a page may take before the offline shell is kinder than waiting.
 *
 * The console answers in about a tenth of a second, and its slowest honest
 * path — every figure on the dashboard with Linked Helper wedged — is under
 * three. Eight seconds is therefore far past "slow" and squarely in "this
 * machine is not coming back", which is the only case worth pre-empting. Set
 * it much tighter and a cold start after a deploy would be mistaken for the
 * Mac being asleep.
 */
const NAVIGATE_TIMEOUT_MS = 8000;

async function navigateOrOffline(request) {
  const controller = new AbortController();
  let timer;
  const giveUp = new Promise((resolve) => {
    timer = setTimeout(() => {
      // Abort the request too. Without this the socket stays open behind an
      // offline page nobody is going to replace.
      controller.abort();
      resolve(null);
    }, NAVIGATE_TIMEOUT_MS);
  });

  try {
    const res = await Promise.race([
      fetch(request, { signal: controller.signal }).catch(() => null),
      giveUp,
    ]);
    if (res) return res;
  } finally {
    clearTimeout(timer);
  }

  // Last resort. If even the shell is missing from the cache, say something
  // rather than hand the browser an undefined and let it show its own error.
  const offline = await caches.match("/offline.html");
  return (
    offline ||
    new Response("The console is not answering. Check the Mac is awake.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Pages: network first, offline shell when the network is gone OR too slow
  // to be useful. The catch alone only fired on a hard failure, so the case
  // that actually happens here — the Mac asleep, the connection accepted and
  // then nothing — left a founder on a white screen indefinitely. A dead TCP
  // connection does not reject, it hangs.
  if (request.mode === "navigate") {
    event.respondWith(navigateOrOffline(request));
    return;
  }

  // Static assets: cache first, fill the cache from the network.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Stride Console", body: "A draft is ready to review." };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // A push without JSON still shows the default line.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
