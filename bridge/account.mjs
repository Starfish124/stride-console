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

/* The campaign window, by the front bundle it is served from.
 *
 * Not just "a file:// page in an app called linked-helper": the account
 * instance keeps assets/block.html open too, the overlay shown while an action
 * is blocked, and it lives under the same app directory. Matching the app name
 * picks whichever of the two Electron happens to list first, so a run can
 * silently end up driving a blank overlay. Match the front build itself. */
export const CAMPAIGN_UI_PATH = "@linked-helper/front/build/index.html";

/**
 * The campaign UI page inside the account instance.
 *
 * That instance exposes half a dozen targets or more: the live LinkedIn tab,
 * its iframes, workers, the block overlay. The one we want is the front build.
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

  const ui = targets.find((t) => t.type === "page" && String(t.url).includes(CAMPAIGN_UI_PATH));
  if (ui) return ui;

  /* Something answered on that port, but it was not the campaign window. Which
   * app answered decides what to say, and the port alone cannot tell you: the
   * launcher and the account instance share one userDataDir, so both write
   * DevToolsActivePort and the last to launch wins. A port that answers is not
   * evidence an account is running — when the launcher wrote it, that is the
   * launcher replying. The LinkedIn tab is what marks the account instance. */
  if (targets.some((t) => String(t.url).includes("linkedin.com"))) {
    throw new CdpError(
      "The LinkedIn session is running but its campaign window is not open. Open the account window in Linked Helper, then try again.",
      "no_campaign_ui",
    );
  }
  throw new CdpError(
    `Linked Helper's LinkedIn session is not running — port ${port} answered, but it is the launcher, not an account. Press Start the runner, then try again.`,
    "account_not_running",
  );
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

  /**
   * Any other CDP method, on the same live session. Input.dispatchMouseEvent
   * above all: Linked Helper's wizard buttons ignore element.click(), so the
   * walk has to move a real pointer.
   */
  async call(method, params = {}) {
    // Reuse evaluate's discovery and reconnection rather than repeating it.
    if (!this.#session) await this.evaluate("1");
    return this.#session.call(method, params);
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
export async function createCampaign(session, { name, template, onProgress } = {}) {
  const cleanName = String(name ?? "").trim();
  const wanted = String(template ?? "").trim();
  if (!cleanName) throw new CdpError("A campaign needs a name.", "no_name");
  if (!wanted) throw new CdpError("Pick a template.", "no_template");

  /* 1. Open the picker.
   *
   * "Is it already open" has to be answered by looking, not by reading. Every
   * screen the wizard has shown stays in the DOM after it closes, so the
   * template heading is still findable long after the dialog is gone. Asking
   * whether an element carrying it is actually on screen is the difference
   * between opening the wizard and quietly skipping that step. */
  /* Get back to the campaign list first. After a campaign is made Linked
   * Helper drops you inside it, in the workflow editor, and that screen has no
   * Create button at all. Creating twice in a row failed on exactly this. */
  await session.evaluate(`
    (() => {
      const back = [...document.querySelectorAll('a,button,div,span')].find(el => {
        const t = (el.innerText || '').trim();
        return /^all campaigns$/i.test(t) && el.getBoundingClientRect().width > 0;
      });
      if (!back) return 'already on the list';
      back.click();
      return 'went back to the list';
    })()
  `);
  await new Promise((r) => setTimeout(r, 1200));

  const opened = JSON.parse(
    await session.evaluate(`
      (() => {
        const visibleHeading = [...document.querySelectorAll('div,h1,h2,h3,span')].some(el => {
          if (!/Choose a template for your campaign/.test(el.textContent || '')) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        });
        if (visibleHeading) return JSON.stringify({ ok: true, already: true });

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
  //
  // Everything here is scoped to the modal. Searching the whole document put
  // the campaign name into the "Search campaign" box sitting behind the
  // wizard, and found the "Create campaign" opener when looking for a confirm.
  const filled = JSON.parse(
    await session.evaluate(`
      (() => {
        const wanted = ${JSON.stringify(wanted.toLowerCase())};

        const inner = [...document.querySelectorAll('div')]
          .filter(d => (d.innerText || '').includes('Choose a template for your campaign'))
          .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
        if (!inner) return JSON.stringify({ ok: false, why: 'wizard not open' });
        let modal = inner;
        for (let i = 0; i < 8 && modal.parentElement; i++) {
          if (/Popup_|Modal_|Dialog_/i.test(modal.getAttribute('class') || '')) break;
          modal = modal.parentElement;
        }

        const input = [...modal.querySelectorAll('input')]
          .find(i => i.type !== 'checkbox' && i.type !== 'radio' && i.offsetParent !== null
                     && !/search/i.test(i.placeholder || ''));
        if (!input) return JSON.stringify({ ok: false, why: 'no name field inside the wizard' });

        // React tracks its own value, so a plain assignment is ignored.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(cleanName)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const cards = [...modal.querySelectorAll('div,li,button,article')].filter(el => {
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

  /* 3. Walk the rest of the wizard.
   *
   * Picking a template is only the first screen. Linked Helper then shows one
   * screen per action in that template ("Step 1. Add 'Visit-and-extract'
   * action", and so on) and the campaign is not written until the last one is
   * finished. Confirming once creates nothing, which is what the database
   * check caught the first time this ran.
   *
   * Two things make the walk work.
   *
   * The topmost dialog is found by structure, not by text. Every earlier
   * screen stays in the DOM behind the current one, so the template list is
   * still there on step 4 and any text test on the page reports the wrong
   * screen forever.
   *
   * A step whose forward button is disabled is waiting on a required field.
   * Each of these screens carries an "I don't want to..." opt-out, so ticking
   * it is how a campaign gets created with defaults rather than with guesses
   * about what belongs in someone else's CRM URL.
   */
  const seen = [];
  const MAX_STEPS = 16;

  for (let i = 0; i < MAX_STEPS; i++) {
    const step = JSON.parse(
      await session.evaluate(`
        (() => {
          const FORWARD = /^(next|continue|finish|create|done|save)$/i;
          const never = /unlock|buy|purchase|subscribe|upgrade/i;

          // Smallest element that still owns a forward button: the live dialog.
          const cands = [...document.querySelectorAll('div')].filter(d =>
            [...d.querySelectorAll('button')].some(b => {
              const t = (b.innerText || '').trim();
              return FORWARD.test(t) && !never.test(t.toLowerCase());
            }),
          );
          if (!cands.length) return JSON.stringify({ done: true });
          cands.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
          const top = cands[0];

          const fwd = [...top.querySelectorAll('button')].find(b => {
            const t = (b.innerText || '').trim();
            return FORWARD.test(t) && !never.test(t.toLowerCase());
          });
          if (!fwd) return JSON.stringify({ done: true });

          const heading = (top.innerText || '').trim().split('\\n')[0].slice(0, 80);

          /* Blocked on a required field: take the step's own opt-out.
           *
           * The search climbs from the button rather than reusing the scope
           * above. That scope is the smallest element owning a forward button,
           * which on these screens is the button row alone: the checkbox sits
           * higher up with the explanatory copy, so looking inside the row
           * found nothing and every step stalled on a disabled Finish. */
          let optedOut = null;
          if (fwd.disabled) {
            let scope = fwd;
            for (let h = 0; h < 10 && scope.parentElement; h++) {
              if (scope.querySelector('input[type=checkbox]')) break;
              scope = scope.parentElement;
            }
            const box = [...scope.querySelectorAll('input[type=checkbox]')].find(
              c => !c.checked && /don't want|do not want|skip/i.test(
                (c.closest('label') || c.parentElement || {}).innerText || '',
              ),
            );
            if (box) {
              box.click();
              optedOut = ((box.closest('label') || box.parentElement).innerText || '').trim().slice(0, 70);
            }
          }

          const r = fwd.getBoundingClientRect();
          return JSON.stringify({
            done: false,
            heading,
            label: fwd.innerText.trim(),
            disabled: fwd.disabled,
            optedOut,
            x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + r.height / 2),
          });
        })()
      `),
    );

    if (step.done) break;
    seen.push(step.heading);

    // Real pointer events: these buttons ignore element.click().
    await session.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: step.x, y: step.y, buttons: 0 });
    await new Promise((r) => setTimeout(r, 120));
    await session.call("Input.dispatchMouseEvent", { type: "mousePressed", x: step.x, y: step.y, button: "left", clickCount: 1 });
    await session.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: step.x, y: step.y, button: "left", clickCount: 1 });
    await new Promise((r) => setTimeout(r, 1800));

    if (onProgress) onProgress({ heading: step.heading, clicked: step.label, optedOut: step.optedOut });
  }

  /* Once the campaign exists Linked Helper offers to start it or fill it with
   * profiles right away. Leaving that dialog open blocks the app: the next
   * creation cannot reach the Create button behind it. Decline it. Starting a
   * campaign is a separate decision with its own guard, and it is not one to
   * make silently at the end of a create. */
  await session.evaluate(`
    (() => {
      const later = [...document.querySelectorAll('button')].find(b =>
        /no,? i will do this later|later|not now/i.test((b.innerText || '').trim()),
      );
      if (later) { later.click(); return 'declined'; }
      return 'nothing to decline';
    })()
  `);
  await new Promise((r) => setTimeout(r, 1200));

  return { name: cleanName, template: wanted, screens: seen };
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
