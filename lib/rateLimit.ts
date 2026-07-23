// Simple in-memory IP rate limiter for the public /pitch endpoint.
// Per-process and reset on restart, which is exactly enough for a signup form.

const hits = new Map<string, number[]>();

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

export function allowRequest(
  ip: string,
  now: number = Date.now(),
  max: number = MAX_PER_WINDOW,
  windowMs: number = WINDOW_MS,
): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map bounded when many IPs pass through.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(key);
    }
  }
  return true;
}

/** For tests: forget every recorded hit. */
export function resetRateLimit(): void {
  hits.clear();
}
