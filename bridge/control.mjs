// Acting on Linked Helper, as opposed to reading it.
//
// Reading goes through db.mjs, because LH2's screen has lied to us twice and
// its database never has. But the campaign verbs are not reachable from the
// database — writing to a running app's store corrupts it — so acting means
// driving LH2's own interface, exactly where a person would click.
//
// That interface is hostile to automation in one specific way: LH2 shows
// unsolicited marketing pop-ups over everything, with buttons like "Unlock
// these offers and exclusive deals today!" next to the one you wanted. Any
// click-by-coordinate scheme will eventually buy something. So:
//
//   - nothing is ever clicked by coordinate
//   - pop-ups are cleared first, and only via an allowlist of dismissal words
//   - a denylist blocks the commercial buttons outright, belt and braces
//   - every action is verified against the database afterwards; if the row did
//     not change, the action failed, and it says so rather than claiming success

import { CdpSession, CdpError } from "./cdp.mjs";

const session = new CdpSession();

/** The only button labels we will ever click to clear a notice. */
const DISMISS_LABELS = [
  "skip all",
  "ok",
  "close",
  "got it",
  "no thanks",
  "later",
  "maybe later",
  "dismiss",
  "cancel",
];

/**
 * Words that must never be clicked, whatever else matches. LH2's pop-ups sell
 * proxies, subscriptions and account rentals; none of that is ours to accept.
 */
const NEVER_CLICK = /unlock|buy|purchase|subscribe|upgrade|offer|deal|renew|pay|trial|order/i;

/**
 * Is this button label one we are allowed to click to clear a notice?
 *
 * Anchored at the start with a boundary, so "Skip all (3)" matches "skip all"
 * while "Unlock these offers" can never match "ok". Exported because this is
 * the rule that keeps automation from buying proxies, and rules like that
 * deserve tests rather than trust.
 */
export function isDismissLabel(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t || NEVER_CLICK.test(t)) return false;
  return DISMISS_LABELS.some((l) => t === l || t.startsWith(`${l} `) || t.startsWith(`${l}(`));
}

/** Labels that must never be clicked by anything, ever. */
export function isForbidden(text) {
  return NEVER_CLICK.test((text || "").toLowerCase());
}

export class ControlError extends Error {
  constructor(message, code = "control_error") {
    super(message);
    this.name = "ControlError";
    this.code = code;
  }
}

/**
 * Clear any Linked Helper notice pop-ups.
 *
 * Returns what it dismissed so the caller can log it — an ad appearing mid
 * action is worth seeing in the record afterwards.
 */
export async function dismissNotices({ rounds = 5 } = {}) {
  const dismissed = [];

  for (let i = 0; i < rounds; i++) {
    const result = await session.evaluate(`
      (() => {
        const allow = ${JSON.stringify(DISMISS_LABELS)};
        const never = ${NEVER_CLICK.toString()};

        const popups = [...document.querySelectorAll('[class*="Popup_Popup"], [role=dialog]')]
          .filter(p => p.getBoundingClientRect().width > 100);
        if (popups.length === 0) return JSON.stringify({ done: true });

        const popup = popups[0];
        const title = (popup.innerText || '').trim().split('\\n')[0].slice(0, 80);

        for (const label of allow) {
          const button = [...popup.querySelectorAll('button')].find(b => {
            const text = (b.innerText || '').trim().toLowerCase();
            if (!text || never.test(text)) return false;
            // "Skip all (3)" must match "skip all", but "ok" must not match
            // "unlock" — anchor to the start and require a word boundary.
            return text === label || text.startsWith(label + ' ') || text.startsWith(label + '(');
          });
          if (button) {
            button.click();
            return JSON.stringify({ done: false, clicked: button.innerText.trim(), title });
          }
        }
        return JSON.stringify({ done: true, stuck: title });
      })()
    `);

    const step = JSON.parse(result);
    if (step.done) {
      if (step.stuck) {
        throw new ControlError(
          `A Linked Helper pop-up is open that offers no safe way out: "${step.stuck}". Close it by hand.`,
          "popup_stuck",
        );
      }
      return dismissed;
    }
    dismissed.push({ notice: step.title, clicked: step.clicked });
    await new Promise((r) => setTimeout(r, 350));
  }

  throw new ControlError(
    "Linked Helper kept showing pop-ups. Clear them by hand and try again.",
    "popup_storm",
  );
}

/** What Linked Helper is showing, for deciding whether it is safe to act. */
export async function describeUi() {
  const raw = await session.evaluate(`
    (() => {
      const popups = [...document.querySelectorAll('[class*="Popup_Popup"], [role=dialog]')]
        .filter(p => p.getBoundingClientRect().width > 100);
      return JSON.stringify({
        title: document.title,
        url: location.href,
        popupCount: popups.length,
        popupTitles: popups.map(p => (p.innerText||'').trim().split('\\n')[0].slice(0, 80)),
        headings: [...document.querySelectorAll('h1,h2,h3')].map(h => (h.innerText||'').trim()).filter(Boolean).slice(0, 8),
      });
    })()
  `);
  return JSON.parse(raw);
}

/**
 * Find a button by its visible text, anywhere on the page, and click it.
 * Text, never coordinates — a pop-up that appears between deciding and
 * clicking then costs us a miss, not a purchase.
 */
export async function clickByText(text, { exact = false } = {}) {
  const clicked = await session.evaluate(`
    (() => {
      const want = ${JSON.stringify(text.toLowerCase())};
      const never = ${NEVER_CLICK.toString()};

      // Anchor on the words a person would read, then walk up to whatever
      // actually carries the handler. Half of Linked Helper's controls are
      // plain divs with an onclick, so "find the button" is not enough.
      const labels = [...document.querySelectorAll('button, [role=button], a, div, span, li')]
        .filter(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          if (!t || t.length > 120 || never.test(t)) return false;
          return ${exact ? "t === want" : "t.includes(want)"};
        })
        // Innermost match first: the tightest wrapper around the words.
        .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);

      for (const label of labels) {
        if (label.getBoundingClientRect().width === 0) continue;

        let node = label;
        for (let hops = 0; node && hops < 6; hops++, node = node.parentElement) {
          const clickable =
            typeof node.onclick === 'function' ||
            node.tagName === 'BUTTON' ||
            node.tagName === 'A' ||
            node.getAttribute('role') === 'button' ||
            /clickable/i.test(node.getAttribute('class') || '') ||
            getComputedStyle(node).cursor === 'pointer';
          if (!clickable) continue;

          node.click();
          return JSON.stringify({
            ok: true,
            text: (label.innerText || '').trim().slice(0, 60),
            via: node.tagName + '.' + (node.getAttribute('class') || '').split(' ')[0],
          });
        }
      }
      return JSON.stringify({ ok: false });
    })()
  `);
  return JSON.parse(clicked);
}

/**
 * Icon-only buttons in Linked Helper's account rows carry no title, no
 * aria-label and no text — but they do show a tooltip on hover, which is the
 * same label a person reads before clicking. So we read it too.
 *
 * This matters more than it sounds. On the account row, "Show window" and
 * "Run campaigns" are four icons apart, and "Run campaigns" fires the whole
 * queue at real people. Nothing here may be chosen by position.
 */
async function hover(x, y) {
  await session.call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
}

/** Every icon in the row for `rowText`, keyed by the tooltip it reveals. */
export async function scanRowIcons(rowText) {
  const geometry = JSON.parse(
    await session.evaluate(`
      (() => {
        const leaf = [...document.querySelectorAll('*')]
          .filter(e => e.children.length === 0 && (e.textContent||'').trim() === ${JSON.stringify(rowText)})[0];
        if (!leaf) return JSON.stringify({ found: false });
        let row = leaf;
        for (let i = 0; i < 6 && row; i++) { if ((row.innerText||'').includes('Show password')) break; row = row.parentElement; }
        const r = row.getBoundingClientRect();
        return JSON.stringify({ found: true, y: Math.round(r.y + r.height/2), left: Math.round(r.x) });
      })()
    `),
  );
  if (!geometry.found) throw new ControlError(`No account row for "${rowText}".`, "row_not_found");

  const y = geometry.y;
  // Drag the pointer across the row so its hover toolbar renders.
  for (const x of [420, 640, 800]) {
    await hover(x, y);
    await new Promise((r) => setTimeout(r, 140));
  }

  const positions = JSON.parse(
    await session.evaluate(`
      JSON.stringify([...document.querySelectorAll('button')]
        .map(b => { const q = b.getBoundingClientRect(); return { q }; })
        .filter(o => o.q.width && Math.abs(o.q.y + o.q.height/2 - ${y}) < 45 && o.q.x > 650)
        .sort((a, z) => a.q.x - z.q.x)
        .map(o => ({ x: Math.round(o.q.x + o.q.width/2), y: Math.round(o.q.y + o.q.height/2) })))
    `),
  );

  // The tooltip has no stable class and sits wherever it likes, so identify it
  // by what it is: a short label that was not on the page a moment ago.
  const SHORT_TEXTS = `
    [...document.querySelectorAll('div,span')]
      .filter(e => e.children.length === 0)
      .map(e => (e.innerText||'').trim())
      .filter(t => t && t.length < 30)
  `;
  const baseline = new Set(JSON.parse(await session.evaluate(`JSON.stringify(${SHORT_TEXTS})`)));

  const icons = [];
  for (const p of positions) {
    // Step off and back on, so a tooltip that is already open is re-triggered.
    await hover(p.x - 30, p.y);
    await new Promise((r) => setTimeout(r, 120));
    await hover(p.x, p.y);
    await new Promise((r) => setTimeout(r, 750));

    const texts = JSON.parse(await session.evaluate(`JSON.stringify(${SHORT_TEXTS})`));
    const fresh = texts.filter((t) => !baseline.has(t));
    icons.push({ ...p, tooltip: (fresh[0] || "").trim() });
  }
  return icons;
}

/**
 * Click the icon whose tooltip matches exactly. Refuses anything on the
 * denylist, so "Run campaigns" can never be reached by this path.
 */
export async function clickIconByTooltip(rowText, label) {
  if (NEVER_CLICK.test(label)) {
    throw new ControlError(`Refusing to click "${label}" — it is on the never-click list.`, "denied");
  }
  const icons = await scanRowIcons(rowText);
  const want = label.trim().toLowerCase();
  const match = icons.find((i) => i.tooltip.toLowerCase() === want);
  if (!match) {
    throw new ControlError(
      `No icon labelled "${label}" on that row. Found: ${icons.map((i) => i.tooltip || "?").join(", ")}.`,
      "icon_not_found",
    );
  }
  await hover(match.x, match.y);
  await new Promise((r) => setTimeout(r, 120));
  await session.call("Input.dispatchMouseEvent", { type: "mousePressed", x: match.x, y: match.y, button: "left", clickCount: 1 });
  await session.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: match.x, y: match.y, button: "left", clickCount: 1 });
  return { clicked: match.tooltip, at: { x: match.x, y: match.y } };
}

export { session as controlSession, CdpError };
