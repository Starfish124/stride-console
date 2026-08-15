// Voice control, scoped to what it can never get wrong.
//
// "Give it full control to navigate" is a real capability, but the model
// itself is never in the loop for where it sends you — that would mean
// trusting a small local model to invent a URL, and the console's own docs
// are blunt about how confidently it invents things. So the decision is
// entirely deterministic instead: an utterance only navigates when it
// starts with a plain imperative ("open", "go to", "show me"...) and the
// rest of it matches a page or a live client by name, scored the exact
// same way the ⌘K palette already scores search. No verb, no navigation —
// "what needs me today" must never be mistaken for a command because one of
// its words happens to resemble a menu label.

import { matchDestination } from "../menu.ts";

const NAV_VERB =
  /^\s*(?:hey stride[,.]?\s*)?(?:please\s+)?(open|go to|goto|navigate to|take me to|show me|pull up|switch to|bring up|jump to)\b\s*/i;

export interface NavIntent {
  href: string;
  label: string;
}

export interface NavClient {
  id: string;
  label: string;
}

/**
 * A destination, or undefined when this was an ordinary question. The
 * client list is the caller's job to fetch — this stays pure so it tests
 * without a network.
 */
export function detectNavigation(text: string, clients: NavClient[] = []): NavIntent | undefined {
  const verbMatch = text.match(NAV_VERB);
  if (!verbMatch) return undefined;
  const target = text.slice(verbMatch[0].length).trim();
  if (!target) return undefined;

  // A named client outranks a menu-label guess — "open Durabo" should never
  // land on a page that merely mentions the word.
  const targetLower = target.toLowerCase();
  const client = clients.find((c) => {
    const who = c.label.toLowerCase();
    return who.length > 2 && (targetLower === who || targetLower.includes(who) || who.includes(targetLower));
  });
  if (client) return { href: `/clients/${client.id}`, label: client.label };

  const page = matchDestination(target);
  return page ? { href: page.href, label: page.label } : undefined;
}
