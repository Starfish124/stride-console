// Server-side reads against the DaemonDeck daemon on loopback. The deck token
// stays on this side; the browser only ever sees what the page renders.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DeckSession {
  name: string;
  windows: number;
  attached: boolean;
  cwd: string;
  cmd: string;
  state: "idle" | "working";
  tail: string[];
}

const TOKEN_FILE = path.join(os.homedir(), ".config", "deck", "remote", "token");

export async function deckGet<T>(p: "/api/sessions"): Promise<T | null> {
  try {
    const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    const res = await fetch(`http://127.0.0.1:8765${p}`, {
      headers: { "X-Deck-Token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Live sessions in the building area's own namespace, or null if the daemon is unreachable. */
export async function buildSessions(): Promise<DeckSession[] | null> {
  const data = await deckGet<{ sessions: DeckSession[] }>("/api/sessions");
  if (!data) return null;
  return data.sessions.filter((s) => s.name.startsWith("b-"));
}
