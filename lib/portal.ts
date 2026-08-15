// Portal tokens: the secret half of the read-only client portal.
//
// A founder mints one link per client and hands it over; whoever holds the
// link sees that client's engagement and nothing else. The token is the
// whole credential, so the file lives at 0600 like the invoices do, and
// nothing in this module ever logs a token. Constant-time comparison would
// be theatre here: the token is a random 48-hex lookup key, not a password
// anyone typed.

import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR, readJson, writeJson } from "./store.ts";

const FILE = path.join(DATA_DIR, "portal-tokens.json");
const MODE = 0o600;

export interface PortalToken {
  token: string;
  clientId: string;
  createdAt: string;
  /** Set when revoked or replaced. A revoked token stays on file as a record. */
  revokedAt?: string;
}

function listTokens(): PortalToken[] {
  return readJson<PortalToken[]>(FILE, []);
}

function saveTokens(tokens: PortalToken[]): void {
  writeJson(FILE, tokens, MODE);
}

/**
 * One active token per client. Minting again revokes the old link first, so
 * "the link leaked" has a one-button answer: mint a fresh one.
 */
export function mintPortalToken(clientId: string): PortalToken {
  const now = new Date().toISOString();
  const tokens = listTokens().map((t) =>
    t.clientId === clientId && !t.revokedAt ? { ...t, revokedAt: now } : t,
  );
  const record: PortalToken = {
    token: crypto.randomBytes(24).toString("hex"),
    clientId,
    createdAt: now,
  };
  saveTokens([record, ...tokens]);
  return record;
}

/** The client's live token, if one exists. */
export function portalTokenFor(clientId: string): PortalToken | undefined {
  return listTokens().find((t) => t.clientId === clientId && !t.revokedAt);
}

/** Token to clientId. Unknown and revoked both come back undefined, on purpose. */
export function resolvePortalToken(token: string): string | undefined {
  if (!token) return undefined;
  const hit = listTokens().find((t) => t.token === token);
  return hit && !hit.revokedAt ? hit.clientId : undefined;
}

/** Kill the client's live link. True if there was one to kill. */
export function revokePortalToken(clientId: string): boolean {
  const tokens = listTokens();
  const live = tokens.find((t) => t.clientId === clientId && !t.revokedAt);
  if (!live) return false;
  live.revokedAt = new Date().toISOString();
  saveTokens(tokens);
  return true;
}
