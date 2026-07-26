import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../store.ts";
import type { Channel, ChannelFact, ChannelStatus } from "./types.ts";

/**
 * The console's view of Linked Helper 2.
 *
 * The console is public over Tailscale Funnel; Linked Helper only exists on the
 * Mac mini. Nothing here talks to LH2 directly — it all goes through the bridge
 * daemon on loopback (bridge/server.mjs), which owns the debugger connection.
 * Server-side only: it reads a token off disk.
 */

const BRIDGE_FILE = path.join(DATA_DIR, "bridge.json");
const DEFAULT_PORT = 7455;
const TIMEOUT_MS = 20_000;

/** Warn this far out, so a dead campaign is never the way we learn it lapsed. */
const LICENCE_WARN_DAYS = 7;

interface BridgeCredentials {
  token: string;
  port: number;
}

interface BridgeAccount {
  email: string;
  name: string | null;
  loggedIn: boolean;
  state: string | null;
  /** valid / expired / none / unknown — never infer "expired" from "unknown". */
  licenceState: "valid" | "expired" | "none" | "unknown";
  licenceDaysLeft: number | null;
  licenceUntil: string | null;
  licence: string | null;
}

interface BridgeHealth {
  state: "ready" | "degraded" | "off" | "error";
  detail: string;
  code?: string;
  app?: { title: string; uiUrl: string; documentReady: string };
  accounts: { workspace: string | null; accounts: BridgeAccount[]; noCampaignsYet: boolean } | null;
  at: string;
}

function readCredentials(): BridgeCredentials | null {
  try {
    const raw = JSON.parse(fs.readFileSync(BRIDGE_FILE, "utf8")) as Partial<BridgeCredentials>;
    if (typeof raw.token !== "string" || raw.token.length < 32) return null;
    return { token: raw.token, port: typeof raw.port === "number" ? raw.port : DEFAULT_PORT };
  } catch {
    return null;
  }
}

/** Turn the bridge's account read into facts worth putting on a screen. */
function accountFacts(health: BridgeHealth): ChannelFact[] {
  const facts: ChannelFact[] = [];
  const accounts = health.accounts?.accounts ?? [];

  for (const account of accounts.filter((a) => a.loggedIn)) {
    const who = account.name ?? account.email;
    const tier = account.licence ?? "Licence";

    if (account.licenceDaysLeft !== null) {
      const days = account.licenceDaysLeft;
      const when = account.licenceUntil ? ` (${account.licenceUntil})` : "";
      facts.push({
        label: who,
        value: days > 0 ? `${tier}, ${days} day${days === 1 ? "" : "s"} left${when}` : `${tier}, expired`,
        warn: days <= LICENCE_WARN_DAYS,
      });
    } else if (account.licenceState === "valid") {
      facts.push({ label: who, value: tier, warn: false });
    } else {
      facts.push({ label: who, value: "licence unreadable", warn: true });
    }

    if (account.state) {
      facts.push({ label: `${who} — state`, value: account.state, warn: false });
    }
  }

  for (const account of accounts.filter((a) => !a.loggedIn)) {
    facts.push({ label: account.email, value: "not logged in", warn: true });
  }

  if (health.accounts?.noCampaignsYet) {
    facts.push({ label: "Campaigns", value: "none created yet", warn: true });
  }

  return facts;
}

async function fetchHealth(creds: BridgeCredentials): Promise<BridgeHealth> {
  const res = await fetch(`http://127.0.0.1:${creds.port}/health`, {
    headers: { Authorization: `Bearer ${creds.token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.status === 401) {
    throw new Error("The bridge rejected our token. Restart the bridge, or delete data/bridge.json and let it mint a new one.");
  }
  if (!res.ok) throw new Error(`The bridge answered HTTP ${res.status}.`);
  return (await res.json()) as BridgeHealth;
}

export interface LhCampaign {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  type: string;
  state: "running" | "paused" | "archived" | "invalid";
  createdAt: string;
  stepCount: number;
  /** Distinct profiles this campaign is working on. */
  people: number;
  steps: string[];
}

export interface LhAccountCampaigns {
  account: {
    id: number | null;
    externalId: number | string | null;
    name: string | null;
    email: string | null;
    lastLoginAt: string | null;
  };
  campaigns: LhCampaign[];
  peopleCollected: number;
  dailyMax: number | null;
  usedToday: number | null;
  error: string | null;
}

export interface LhCampaignsView {
  accounts: LhAccountCampaigns[];
  campaignCount: number;
  /** Set when there is no database to read at all. */
  unavailable?: string;
  /** Set when the bridge itself could not be reached. */
  offline?: string;
  at: string;
}

/**
 * Read-only mirror of what Linked Helper has. Never throws: a page that cannot
 * reach the bridge should say so calmly, not 500.
 */
export async function readCampaignsView(): Promise<LhCampaignsView> {
  const empty = { accounts: [], campaignCount: 0, at: new Date().toISOString() };
  const creds = readCredentials();
  if (!creds) {
    return { ...empty, offline: "The bridge has never run, so there is nothing to read yet." };
  }
  try {
    const res = await fetch(`http://127.0.0.1:${creds.port}/campaigns`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ...empty, offline: `The bridge answered HTTP ${res.status}.` };
    return (await res.json()) as LhCampaignsView;
  } catch {
    return { ...empty, offline: `Nothing answered on the bridge at 127.0.0.1:${creds.port}.` };
  }
}

export const linkedHelperChannel: Channel = {
  id: "linked-helper",
  label: "Linked Helper 2",

  async status(): Promise<ChannelStatus> {
    const checkedAt = new Date().toISOString();
    const base = { id: "linked-helper" as const, label: "Linked Helper 2", checkedAt };

    const creds = readCredentials();
    if (!creds) {
      return {
        ...base,
        state: "off",
        detail:
          "The bridge has never run. Start it with `node bridge/server.mjs` from the repo root, or load com.stride.bridge.",
      };
    }

    let health: BridgeHealth;
    try {
      health = await fetchHealth(creds);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const unreachable = /fetch failed|timed out|ECONNREFUSED|aborted/i.test(message);
      return {
        ...base,
        state: unreachable ? "off" : "error",
        detail: unreachable
          ? `Nothing answered on the bridge at 127.0.0.1:${creds.port}. It is not running.`
          : message,
      };
    }

    const facts = accountFacts(health);

    // The bridge says the channel is live. Downgrade only on positive evidence
    // that nothing can send: at least one licence we can read has run out, and
    // none we can read is still good. An unreadable licence is not an expired
    // one, and reporting it as such raises a false alarm on a working account.
    if (health.state === "ready") {
      const loggedIn = (health.accounts?.accounts ?? []).filter((a) => a.loggedIn);
      const anyValid = loggedIn.some((a) => a.licenceState === "valid");
      const anyExpired = loggedIn.some((a) => a.licenceState === "expired");

      if (loggedIn.length > 0 && !anyValid && anyExpired) {
        return {
          ...base,
          state: "degraded",
          detail: "Linked Helper is open, but every licence we can read has run out. Campaigns cannot run.",
          facts,
        };
      }
      if (loggedIn.length === 0) {
        return {
          ...base,
          state: "degraded",
          detail: "Linked Helper is open, but no LinkedIn account is logged in.",
          facts,
        };
      }
    }

    return { ...base, state: health.state, detail: health.detail, facts };
  },
};
