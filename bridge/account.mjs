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
    /* DevToolsActivePort is left behind when the account instance exits, so a
     * dead port here means the LinkedIn session has been stopped rather than
     * that anything is broken. Say the thing to do about it. */
    throw new CdpError(
      "Linked Helper's LinkedIn session is not running, so there is no campaign window to work in. Start the account in Linked Helper, or press Start the runner, then try again.",
      "account_not_running",
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

/**
 * Create a campaign through Linked Helper's own wizard.
 *
 * Nothing is written to its database. Creating a campaign is a sequence of
 * clicks in the app, exactly as a person would do it, so LH2 builds its own
 * rows and its own defaults and stays consistent with itself.
 *
 * The template is found by the visible name rather than by position, because
 * the picker reflows and reorders. A name that no longer matches fails loudly
 * instead of selecting whatever happened to be next to it.
 *
 * Creating a campaign sends nothing. Every template arrives paused with its
 * steps unarmed, which is why this needs no audience guard: reaching people
 * takes arming the steps and starting the runner, both of them separate acts.
 */
export async function createCampaign(session, { name, template }) {
  const cleanName = String(name ?? "").trim();
  const wanted = String(template ?? "").trim();
  if (!cleanName) throw new CdpError("A campaign needs a name.", "no_name");
  if (!wanted) throw new CdpError("Pick a template.", "no_template");

  // 1. Open the picker.
  const opened = JSON.parse(
    await session.evaluate(`
      (() => {
        if (document.body.innerText.includes('Choose a template for your campaign'))
          return JSON.stringify({ ok: true, already: true });
        const b = [...document.querySelectorAll('button')]
          .find(x => /^create campaign$/i.test((x.innerText || '').trim()));
        if (!b) return JSON.stringify({ ok: false, why: 'no Create campaign button' });
        b.click();
        return JSON.stringify({ ok: true });
      })()
    `),
  );
  if (!opened.ok) throw new CdpError(`Could not open the wizard: ${opened.why}`, "wizard_unavailable");
  await new Promise((r) => setTimeout(r, 1200));

  // 2. Name it, then pick the template by its printed name.
  const filled = JSON.parse(
    await session.evaluate(`
      (() => {
        const wanted = ${JSON.stringify(wanted.toLowerCase())};

        const input = [...document.querySelectorAll('input')]
          .find(i => i.type !== 'checkbox' && i.type !== 'radio' && i.offsetParent !== null);
        if (!input) return JSON.stringify({ ok: false, why: 'no name field' });

        // React tracks its own value, so a plain assignment is ignored.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(cleanName)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const cards = [...document.querySelectorAll('div,li,button,article')].filter(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          return t.startsWith(wanted) && t.length < wanted.length + 200 && el.getBoundingClientRect().width > 60;
        });
        if (cards.length === 0) return JSON.stringify({ ok: false, why: 'template not found', name: input.value });

        // Innermost match: the card itself rather than the grid holding it.
        cards.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
        cards[0].click();
        return JSON.stringify({ ok: true, name: input.value });
      })()
    `),
  );
  if (!filled.ok) {
    throw new CdpError(
      filled.why === "template not found"
        ? `Linked Helper's wizard has no template called "${wanted}". It may have been renamed.`
        : `Could not fill the wizard: ${filled.why}`,
      "wizard_mismatch",
    );
  }
  await new Promise((r) => setTimeout(r, 900));

  // 3. Confirm. The button is whichever of these the wizard is showing.
  const confirmed = JSON.parse(
    await session.evaluate(`
      (() => {
        const never = /unlock|buy|purchase|subscribe|upgrade/i;
        const b = [...document.querySelectorAll('button')].find(x => {
          const t = (x.innerText || '').trim().toLowerCase();
          return !never.test(t) && /^(create|create campaign|continue|next|confirm|done)$/.test(t);
        });
        if (!b) {
          return JSON.stringify({
            ok: false,
            buttons: [...document.querySelectorAll('button')]
              .map(x => (x.innerText || '').trim()).filter(Boolean).slice(0, 14),
          });
        }
        b.click();
        return JSON.stringify({ ok: true, clicked: b.innerText.trim() });
      })()
    `),
  );
  if (!confirmed.ok) {
    throw new CdpError(
      `The wizard offered no confirm button. It showed: ${confirmed.buttons.join(", ")}.`,
      "wizard_no_confirm",
    );
  }

  await new Promise((r) => setTimeout(r, 2000));
  return { name: cleanName, template: wanted, clicked: confirmed.clicked };
}

/** Shut the picker without creating anything. Escape does not do it. */
export async function closeWizard(session) {
  return session.evaluate(`
    (() => {
      const inner = [...document.querySelectorAll('div')]
        .filter(d => (d.innerText || '').includes('Choose a template for your campaign'))
        .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
      if (!inner) return 'not open';
      let root = inner;
      for (let i = 0; i < 8 && root.parentElement; i++) {
        if (/Popup_|Modal_|Dialog_/i.test(root.getAttribute('class') || '')) break;
        root = root.parentElement;
      }
      const close = [...root.querySelectorAll('button')].find(b => /close/i.test(b.getAttribute('class') || ''));
      if (!close) return 'no close button';
      close.click();
      return 'closed';
    })()
  `);
}

export { CdpError };
