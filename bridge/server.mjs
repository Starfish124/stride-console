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
import { readCampaigns, audienceAtRisk, DbUnavailable } from "./db.mjs";
import { dismissNotices, clickIconByTooltip, scanRowIcons, ControlError } from "./control.mjs";

/** Read a JSON request body, tolerating an empty one. */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

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
    // Whether campaigns exist is a database question. It used to be read off
    // the setup wizard's nag text, which drifts in and out of the DOM between
    // renders and had the console reporting "no campaigns" every other refresh.
    let campaignCount = null;
    try {
      campaignCount = readCampaigns().campaignCount;
    } catch {
      campaignCount = null;
    }

    return {
      state: info.ipcUsable ? "ready" : "degraded",
      detail: info.ipcUsable
        ? "Linked Helper is open and the control channel answers."
        : info.ipcDetail,
      app: { title: info.title, uiUrl: info.uiUrl, documentReady: info.documentReady },
      accounts,
      campaignCount,
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

    // Campaigns come from Linked Helper's database, not its screen: the app
    // does not have to be open, and nothing depends on which view it is on.
    if (url.pathname === "/campaigns" && req.method === "GET") {
      try {
        return send(res, 200, readCampaigns());
      } catch (err) {
        if (err instanceof DbUnavailable) {
          return send(res, 200, { accounts: [], campaignCount: 0, unavailable: err.message, at: new Date().toISOString() });
        }
        throw err;
      }
    }

    /* Start or stop an account's campaign runner.
     *
     * Linked Helper has no per-campaign start on the launcher screen: the row
     * button is "Run campaigns", which runs every campaign on that account
     * that is not paused. So the guard is about the audience it would reach,
     * not about which button gets clicked.
     *
     * Refuses when an unpaused campaign holds more people than `maxAudience`
     * unless the caller passes force. The console sets that ceiling; a
     * mistaken tap on a phone must not be able to start six days of
     * invitations to 870 people. */
    if (url.pathname === "/account/run" && req.method === "POST") {
      const body = await readJsonBody(req);
      const email = String(body.email ?? "");
      const maxAudience = Number.isFinite(body.maxAudience) ? Number(body.maxAudience) : 25;
      const force = body.force === true;

      let armed = [];
      try {
        const { campaigns, reach } = audienceAtRisk(readCampaigns(), email);
        armed = campaigns;
        if (!force && reach > maxAudience) {
          return send(res, 409, {
            error: "refused",
            detail: `Starting this account would begin sending to ${reach} people across ${campaigns.length} unpaused campaign(s). Pause them, or confirm deliberately.`,
            reach,
            campaigns,
          });
        }
      } catch {
        // No database to check against: refuse rather than guess.
        if (!force) {
          return send(res, 409, {
            error: "refused",
            detail: "Cannot read Linked Helper's database to see what would be sent, so nothing is starting.",
          });
        }
      }

      await dismissNotices();
      const clicked = await clickIconByTooltip(email, "Run campaigns");
      return send(res, 200, { ok: true, clicked, armed: armed.length });
    }

    if (url.pathname === "/account/stop" && req.method === "POST") {
      // Stopping is always allowed. Nothing is safer than off.
      const body = await readJsonBody(req);
      await dismissNotices();
      const clicked = await clickIconByTooltip(String(body.email ?? ""), "Stop");
      return send(res, 200, { ok: true, clicked });
    }

    if (url.pathname === "/account/icons" && req.method === "GET") {
      // What the row actually offers, by label. Useful when LH2 moves things.
      await dismissNotices();
      const icons = await scanRowIcons(url.searchParams.get("email") ?? "");
      return send(res, 200, { icons: icons.map((i) => i.tooltip).filter(Boolean) });
    }

    return send(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
  } catch (err) {
    // A control failure is the app's state, not a server fault: say which.
    if (err instanceof ControlError) {
      return send(res, 409, { error: err.code, detail: err.message });
    }
    if (err instanceof CdpError) {
      return send(res, 409, { error: err.code, detail: err.message });
    }
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
