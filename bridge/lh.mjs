// What the bridge knows about Linked Helper 2.
//
// Two tiers on purpose:
//
//   probe()      — structural, and stable. Is the app up, is the renderer the
//                  one we expect, is the IPC channel we depend on still there.
//                  This is what health checks should trust.
//
//   readAccounts() — reads the account manager screen. Useful (the licence
//                  countdown lives here and nowhere else we can reach yet) but
//                  it is screen scraping, so it is allowed to fail without
//                  taking the health check down with it. Phase 1 replaces this
//                  with LH2's own campaign services once those are mapped.

import { CdpSession, CdpError } from "./cdp.mjs";

const session = new CdpSession();

/** Structural check. Cheap, and the only signal health should depend on. */
export async function probe() {
  const raw = await session.evaluate(`
    (() => {
      let ipc = null;
      try {
        const e = window.require('electron');
        ipc = e && e.ipcRenderer
          ? { invoke: typeof e.ipcRenderer.invoke, send: typeof e.ipcRenderer.send }
          : null;
      } catch (err) {
        ipc = { error: String(err && err.message || err) };
      }
      return JSON.stringify({
        title: document.title,
        url: location.href,
        ipc,
        ready: document.readyState,
      });
    })()
  `);

  const info = JSON.parse(raw);
  const ipcUsable = info.ipc && info.ipc.invoke === "function" && info.ipc.send === "function";

  return {
    title: info.title,
    // Ephemeral per launch — recorded for diagnosis, never depended on.
    uiUrl: info.url,
    documentReady: info.ready,
    ipcUsable: Boolean(ipcUsable),
    ipcDetail: ipcUsable ? "ipcRenderer reachable" : describeIpcProblem(info.ipc),
  };
}

function describeIpcProblem(ipc) {
  if (!ipc) return "window.require('electron') gave us no ipcRenderer — nodeIntegration may be off in this build.";
  if (ipc.error) return `window.require failed: ${ipc.error}`;
  return "ipcRenderer is present but missing invoke/send.";
}

const DAYS_LEFT = /(\d+)\s*days?/i;

/**
 * Parse the account manager screen's text. Pure, and separated out because it
 * is the most breakable thing here — LH2 auto-updates, and when its markup
 * shifts this is what shifts under us. Tested against a captured fixture.
 *
 * Returns null when the text is not the account screen at all.
 */
export function parseAccountScreen(text) {
  if (typeof text !== "string" || !text.includes("LinkedIn account")) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // The signed-in LH2 user's own address appears near the top of the sidebar,
  // and the filter chips ("Running", "Stopped") sit just under it — which reads
  // exactly like an account row if you start from the top. Anchor on the table
  // header instead, and only treat what follows it as LinkedIn accounts.
  const header = lines.findIndex(
    (l, i) =>
      /^LinkedIn account$/i.test(l) &&
      lines.slice(i + 1, i + 5).some((n) => /^state$/i.test(n)),
  );
  if (header === -1) return null;

  const rows = lines.slice(header);
  const accounts = [];

  for (let i = 0; i < rows.length; i++) {
    const email = rows[i].match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)?.[0];
    if (!email) continue;

    // The rows render as a run of short cells after the address. Read a
    // bounded window rather than assuming a fixed column count.
    const window_ = rows.slice(i + 1, i + 10);
    const loggedIn = !window_.some((l) => /^not logged in$/i.test(l));
    const daysMatch = window_.map((l) => l.match(DAYS_LEFT)).find(Boolean);

    accounts.push({
      email,
      name: /^[A-Z][a-z]+ [A-Z]/.test(window_[0] ?? "") ? window_[0] : null,
      loggedIn,
      state: window_.find((l) => /^(running|stopped|paused)$/i.test(l)) ?? null,
      licenceDaysLeft: daysMatch ? Number(daysMatch[1]) : null,
      licence: window_.find((l) => /^(pro|standard|trial)$/i.test(l)) ?? null,
    });
  }

  const workspace = text.match(/ID:\s*(\d+)/)?.[1] ?? null;
  // Setup wizard still nagging about the first campaign means there are none.
  const noCampaignsYet = /Create your first campaign/i.test(text);

  return { workspace, accounts, noCampaignsYet };
}

/**
 * Best effort read of the account manager screen. Returns null rather than
 * throwing when that screen is not showing — the app may be sitting on a
 * campaign view, and that is not an error.
 */
export async function readAccounts() {
  let text;
  try {
    text = await session.evaluate("document.body.innerText || ''");
  } catch (err) {
    if (err instanceof CdpError) return null;
    throw err;
  }
  return parseAccountScreen(text);
}

export function closeSession() {
  session.close();
}
