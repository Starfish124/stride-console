// The Linked Helper bridge.
//
// The console is public over Tailscale Funnel. Linked Helper only exists on
// this Mac. This daemon is the seam: it holds the debugger connection to LH2
// and answers a small API on loopback only, so the phone reaches LinkedIn
// automation through the console without LH2 ever facing the internet.
//
// Run: node bridge/server.mjs   (from the repo root — it writes data/bridge.json)
//
// Phase 0 serves /health. Campaign reads and controls land in later phases;
// the shape below is what they will slot into.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { probe, readAccounts } from "./lh.mjs";
import { CdpError } from "./cdp.mjs";

const PORT = Number(process.env.STRIDE_BRIDGE_PORT || 7455);
const HOST = "127.0.0.1";
const TOKEN_FILE = path.join(process.cwd(), "data", "bridge.json");

/** A token the console can read off disk. Generated once, reused after that. */
function loadToken() {
  try {
    const existing = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    if (typeof existing.token === "string" && existing.token.length >= 32) return existing.token;
  } catch {
    // First run, or the file was damaged — mint a fresh one below.
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, port: PORT }, null, 2) + "\n", { mode: 0o600 });
  return token;
}

const TOKEN = loadToken();

function authorised(req) {
  const header = req.headers.authorization || "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(offered);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
  });
  res.end(json);
}

/** Health is deliberately structural: is the control channel usable, yes or no. */
async function health() {
  const at = new Date().toISOString();
  try {
    const info = await probe();
    // Screen scraping is allowed to come back empty without failing health.
    let accounts = null;
    try {
      accounts = await readAccounts();
    } catch {
      accounts = null;
    }
    return {
      state: info.ipcUsable ? "ready" : "degraded",
      detail: info.ipcUsable
        ? "Linked Helper is open and the control channel answers."
        : info.ipcDetail,
      app: { title: info.title, uiUrl: info.uiUrl, documentReady: info.documentReady },
      accounts,
      at,
    };
  } catch (err) {
    const code = err instanceof CdpError ? err.code : "unknown";
    return {
      state: code === "not_running" ? "off" : "error",
      detail: err.message,
      code,
      accounts: null,
      at,
    };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === "/ping") return send(res, 200, { ok: true });

  if (!authorised(req)) return send(res, 401, { error: "bad or missing bearer token" });

  try {
    if (url.pathname === "/health" && req.method === "GET") {
      return send(res, 200, await health());
    }
    return send(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
  } catch (err) {
    return send(res, 500, { error: err?.message ?? "bridge failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT} (loopback only)`);
  console.log(`[bridge] token in ${TOKEN_FILE}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
