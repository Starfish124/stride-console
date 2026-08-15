// The terminal relay: the phone's way into a real Claude Code session.
//
// The DaemonDeck daemon on :8765 serves a PTY over WebSocket, gated by one
// machine token — a root-equivalent shell. That token must never reach a
// browser. This relay is the seam: it terminates auth with the console's own
// session cookie, pins the working directory to Stride repos, and only then
// dials the daemon on loopback with the token attached. After the handshake a
// WebSocket is plain TCP, so the relay splices bytes and gets out of the way.
//
// Published as a Tailscale path mount (tailscale strips the prefix):
//   tailscale funnel --bg --set-path /term http://127.0.0.1:7457
// NB `funnel --set-path`, never `serve --set-path` — the serve form rewrites
// the whole 443 config as tailnet-only and takes the app off the internet.
// so the browser dials wss://<host>/term/pty — same origin as the console,
// and the stride_session cookie comes along on its own.
//
// Run: node scripts/term-relay.mjs   (launchd: com.stride.term)

import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.STRIDE_TERM_PORT || 7457);
const DECK_PORT = Number(process.env.DECK_PORT || 8765);
const TOKEN_FILE =
  process.env.DECK_TOKEN_FILE || path.join(os.homedir(), ".config", "deck", "remote", "token");

// The only directories a session may open. This is the enforcement copy;
// lib/build/repos.ts carries the display copy — change both together.
const STRIDE_DIRS = [
  "stride-console",
  "ai-discovery-durabo",
  "stride-durabo",
  "durabo-trend-engine",
  "stride-pitch",
  "ai-agency-website",
].map((d) => path.join(os.homedir(), d));

// node:crypto twin of sessionToken() in lib/auth.ts — the same digest over the
// same string. If that ever changes, change this with it.
const EXPECTED = crypto
  .createHash("sha256")
  .update(`stride-console:${process.env.STRIDE_PASSWORD || "stride"}`)
  .digest("hex");

function authed(req) {
  const m = /(?:^|;\s*)stride_session=([^;]+)/.exec(req.headers.cookie || "");
  const a = Buffer.from(m ? decodeURIComponent(m[1]) : "");
  const b = Buffer.from(EXPECTED);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function refuse(socket, status, text) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
}

const server = http.createServer((req, res) => {
  // /ping is unauthenticated on purpose: it is what `stride status` probes
  // through the public URL, and it says nothing.
  if (req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on("upgrade", (req, socket, head) => {
  if (!authed(req)) return refuse(socket, 401, "Unauthorized");

  // tailscale serve strips the /term prefix, so the path arrives as /pty.
  const url = new URL(req.url, "http://relay");
  if (url.pathname !== "/pty") return refuse(socket, 404, "Not Found");

  // Stride repos only, resolved and exact — no prefix tricks, no traversal.
  const cwd = url.searchParams.get("cwd") || "";
  const resolved = path.resolve(cwd.replace(/^~(?=\/|$)/, os.homedir()));
  if (!STRIDE_DIRS.includes(resolved)) return refuse(socket, 403, "Forbidden");

  const preset = url.searchParams.get("preset") || "claude";
  if (preset !== "claude" && preset !== "shell") return refuse(socket, 403, "Forbidden");

  let token;
  try {
    token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return refuse(socket, 502, "Bad Gateway");
  }

  url.searchParams.set("cwd", resolved);
  // One session per repo, in the console's own namespace — the relay can
  // never attach to a session the desk started.
  url.searchParams.set("session", `b-${path.basename(resolved)}`);
  url.searchParams.set("token", token);

  const upstream = net.connect(DECK_PORT, "127.0.0.1", () => {
    // Replay the browser's upgrade handshake with the token attached. The
    // cookie stays on this side of the seam; the deck token never leaves it.
    const lines = [`GET ${url.pathname}${url.search} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (/^cookie$/i.test(req.rawHeaders[i])) continue;
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head?.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  for (const s of [socket, upstream]) {
    s.setKeepAlive(true, 30_000);
    s.setTimeout(0);
  }
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
  socket.on("close", () => upstream.destroy());
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[term-relay] listening on 127.0.0.1:${PORT} → deck :${DECK_PORT}`);
});
