// The lead book: who Apollo found, ready to be approached on LinkedIn.
//
// Apollo owns the search and the credits; this console owns the reading of it.
// The export lands in data/apollo-leads.json — written from the Apollo MCP
// session, since that is where the account's access actually lives — and
// everything here is a pure read over that file, so the page paints instantly
// and never waits on a third party mid-render.
//
// There is deliberately no Apollo API client here. The account's access is an
// OAuth session, not a key this server holds, and a page that cannot refresh
// the data itself has no business pretending it can. When a key does exist,
// `readLeads` is the one function that changes.
//
// Framework-free, like lib/menu.ts: node tests import it and want no React.

import path from "node:path";
import { DATA_DIR, readJson } from "./store.ts";

export const LEADS_FILE = path.join(DATA_DIR, "apollo-leads.json");

export interface Lead {
  id: string;
  name: string;
  title: string;
  company: string;
  companyDomain: string;
  employees: number | null;
  industry: string;
  city: string;
  country: string;
  /** Empty when Apollo has no verified address; never a guess. */
  email: string;
  emailStatus: string;
  /** Every lead carries one — it is why the list is worth having. */
  linkedin: string;
  apolloUrl: string;
}

export interface LeadBook {
  list: { id: string; name: string; url: string };
  filters: {
    location: string;
    industries: string[];
    employees: string;
    titles: string[];
  };
  /** How many people the saved search matches in Apollo, not how many we hold. */
  poolSize: number;
  exportedAt: string;
  leads: Lead[];
}

const EMPTY: LeadBook = {
  list: { id: "", name: "No list yet", url: "https://app.apollo.io/#/lists" },
  filters: { location: "", industries: [], employees: "", titles: [] },
  poolSize: 0,
  exportedAt: "",
  leads: [],
};

/** The book as exported. Missing file means "nothing pulled yet", not an error. */
export function readLeads(): LeadBook {
  return readJson<LeadBook>(LEADS_FILE, EMPTY);
}

/**
 * One person's job, in the words a founder would use to pick an opener.
 *
 * Apollo's own titles are already plain, so this only groups them: the three
 * personas Stride sells to want three different first lines, and the page
 * would otherwise make a reader infer the persona from the job title on every
 * single row.
 */
export type Persona = "operations" | "finance" | "it" | "other";

export function personaOf(lead: Lead): Persona {
  const t = lead.title.toLowerCase();
  if (/\b(it|ict|information technology|technology|digital|data)\b/.test(t)) return "it";
  if (/\b(finance|financial|controller|cfo|accounting)\b/.test(t)) return "finance";
  if (/\b(operations|operationeel|logistic|logistiek|supply chain|warehouse)\b/.test(t)) {
    return "operations";
  }
  return "other";
}

export const PERSONA_LABEL: Record<Persona, string> = {
  operations: "Operations",
  finance: "Finance",
  it: "IT",
  other: "Other",
};

/** How many leads sit under each persona, in the order the page shows them. */
export function personaCounts(leads: Lead[]): { persona: Persona; count: number }[] {
  const order: Persona[] = ["operations", "finance", "it", "other"];
  const tally = new Map<Persona, number>(order.map((p) => [p, 0]));
  for (const lead of leads) tally.set(personaOf(lead), (tally.get(personaOf(lead)) ?? 0) + 1);
  return order.map((persona) => ({ persona, count: tally.get(persona) ?? 0 }));
}

/**
 * Companies with more than one person on the list.
 *
 * Two people at the same firm is the difference between a cold message and a
 * way in, so it is worth surfacing rather than leaving a reader to spot the
 * repeated company name while scrolling.
 */
export function multiContactCompanies(leads: Lead[]): { company: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.company) continue;
    tally.set(lead.company, (tally.get(lead.company) ?? 0) + 1);
  }
  return [...tally.entries()]
    .filter(([, count]) => count > 1)
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company));
}

/** Leads with a verified email, which is the half the sequencer can act on. */
export function contactableCount(leads: Lead[]): number {
  return leads.filter((l) => l.email).length;
}
