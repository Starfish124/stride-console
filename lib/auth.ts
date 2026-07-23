// Shared-password auth for exactly two founders. The session cookie holds a
// SHA-256 token derived from the password; the proxy verifies it per request.

export const AUTH_COOKIE = "stride_session";
export const FOUNDER_COOKIE = "stride_founder";

export const FOUNDERS = ["Founder A", "Founder B"] as const;

export function getPassword(): string {
  return process.env.STRIDE_PASSWORD || "stride";
}

/** Web Crypto so the same code runs in Node route handlers and the edge proxy. */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`stride-console:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
