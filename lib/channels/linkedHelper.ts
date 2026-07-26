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
  licenceDaysLeft: number | null;
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

  const licensed = accounts.filter((a) => a.licenceDaysLeft !== null);
  for (const account of licensed) {
    const days = account.licenceDaysLeft as number;
    facts.push({
      label: account.name ?? account.email,
      value: `${account.licence ?? "Licence"}, ${days} day${days === 1 ? "" : "s"} left`,
      warn: days <= LICENCE_WARN_DAYS,
    });
  }

  const loggedOut = accounts.filter((a) => !a.loggedIn);
  for (const account of loggedOut) {
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

    // The bridge says the channel is live. Downgrade it ourselves if there is
    // no usable licence — a reachable LH2 that cannot legally send is not ready.
    if (health.state === "ready") {
      const accounts = health.accounts?.accounts ?? [];
      const usable = accounts.some((a) => a.loggedIn && (a.licenceDaysLeft ?? 0) > 0);
      if (accounts.length > 0 && !usable) {
        return {
          ...base,
          state: "degraded",
          detail: "Linked Helper is open, but no logged-in account has a licence left. Campaigns cannot run.",
          facts,
        };
      }
    }

    return { ...base, state: health.state, detail: health.detail, facts };
  },
};
