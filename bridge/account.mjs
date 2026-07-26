// Talking to the per-account Linked Helper instance.
//
// This is the discovery that unlocked campaign work, so it is worth stating
// plainly: Linked Helper is two Electron apps, not one.
//
//   The launcher   /Applications/linked-helper.app/Contents/MacOS/linked-helper
//                  The account manager. We start it with a debugger port
//                  ourselves. It only ever shows one page, and the campaign UI
//                  is not in it.
//
//   The account    .../Contents/Resources/out/linked-helper.app/...
//                  A nested app, spawned per running LinkedIn account with
//                  --app-id=<id>. It holds the LinkedIn session and the
//                  campaign UI: the "LINKEDIN VIEW", where campaigns are made,
//                  and where AI drafts wait for approval.
//
// The account app already runs with --remote-debugging-port=0, so Electron
// assigns it a port and writes it to DevToolsActivePort. No flag of ours, no
// setting changed: it has always been debuggable. The port changes every
// launch, which is why it is read from that file rather than remembered.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CdpSession, CdpError } from "./cdp.mjs";

const LH_HOME =
  process.env.STRIDE_LH_HOME ||
  path.join(os.homedir(), "Library", "Application Support", "linked-helper");

const PORT_FILE = path.join(LH_HOME, "DevToolsActivePort");

/** The account instance's debugger port, as Electron last wrote it. */
export function accountDebugPort(file = PORT_FILE) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    throw new CdpError(
      `No DevToolsActivePort at ${file}. No LinkedIn account is running, so there is no campaign UI to talk to.`,
      "no_account_instance",
    );
  }
  const port = Number(raw.split("\n")[0].trim());
  if (!Number.isInteger(port) || port <= 0) {
    throw new CdpError(`DevToolsActivePort holds "${raw.slice(0, 20)}", which is not a port.`, "bad_port");
  }
  return port;
}

/**
 * The campaign UI page inside the account instance.
 *
 * That instance exposes a dozen-plus targets: the live LinkedIn tab, its
 * iframes, service workers. The one we want is the app's own window, served
 * from a file:// URL, which is what separates it from everything LinkedIn.
 */
export async function findCampaignUi(port = accountDebugPort()) {
  let targets;
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(5000),
    })).json();
  } catch {
    throw new CdpError(
      `The account instance is not answering on 127.0.0.1:${port}. It may have just closed.`,
      "account_unreachable",
    );
  }

  const ui = targets.find(
    (t) => t.type === "page" && String(t.url).startsWith("file://") && /linked-helper/i.test(t.url),
  );
  if (!ui) {
    throw new CdpError(
      "The account instance is running but its campaign window is not open.",
      "no_campaign_ui",
    );
  }
  return ui;
}

/** A session bound to whichever account instance is running right now. */
export class AccountSession {
  #session = null;
  #port = null;

  async evaluate(expression) {
    const port = accountDebugPort();
    if (this.#session && this.#port === port) {
      try {
        return await this.#session.evaluate(expression);
      } catch (err) {
        if (err.code !== "disconnected" && err.code !== "write_failed") throw err;
        this.#session.close();
        this.#session = null;
      }
    }
    // A restarted account means a new port and a new target identity.
    const ui = await findCampaignUi(port);
    const session = new CdpSession(port);
    session.targetUrl = ui.webSocketDebuggerUrl;
    this.#session = session;
    this.#port = port;
    return session.evaluate(expression);
  }

  close() {
    this.#session?.close();
    this.#session = null;
  }
}

/** What the campaign window is showing: counts, campaigns, and its controls. */
export async function readCampaignUi(session) {
  const raw = await session.evaluate(`
    (() => {
      const text = (document.body.innerText || '');
      const num = (label) => {
        const m = text.match(new RegExp(label + '\\\\s*\\\\n?\\\\s*(\\\\d+)', 'i'));
        return m ? Number(m[1]) : null;
      };
      const buttons = [...document.querySelectorAll('button')]
        .map(b => (b.innerText || '').trim().replace(/\\s+/g, ' '))
        .filter(t => t && t.length < 40);
      return JSON.stringify({
        active: num('Active'),
        stopped: num('Stopped'),
        completed: num('Completed'),
        draft: num('Draft'),
        canCreate: buttons.some(t => /^create campaign$/i.test(t)),
        canRun: buttons.some(t => /start campaigns runner/i.test(t)),
        buttons: [...new Set(buttons)].slice(0, 20),
      });
    })()
  `);
  return JSON.parse(raw);
}

export { CdpError };
