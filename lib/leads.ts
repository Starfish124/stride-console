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
import { addClient, DATA_DIR, listClients, readJson, writeJson } from "./store.ts";
import { normaliseAddress, profileSlug } from "./salesnav/suppress.ts";

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
 * Replace the book.
 *
 * The only writer. lib/apollo.ts calls this after a pull; nothing else should,
 * because a half-written book is worse than a stale one and the single-writer
 * rule that makes every other store here safe applies to this file too.
 */
export function writeLeads(book: LeadBook): void {
  writeJson(LEADS_FILE, book);
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


// ---------- getting them into the client book ----------
//
// This is the one function that turns a row Apollo found into somebody the
// sequencer can actually work. Until it existed the whole book was a reading
// room: 148 qualified people, none of them reachable by anything downstream.

export interface ImportResult {
  /** Written, or would be written when this was a dry run. */
  imported: { name: string; company: string }[];
  /** Already in the book, with the field that matched. */
  known: { name: string; company: string; matched: "profile" | "email" | "name" }[];
  /** Nothing usable to import. */
  unusable: { name: string; company: string; why: string }[];
  dryRun: boolean;
}

/**
 * Copy the lead book into the client book, once.
 *
 * Dry by default, and that is not politeness. data/ is gitignored, so
 * clients.json has no history at all — 148 rows appended on top of the
 * founders' real six is not something a checkout can undo. The first call
 * reports what it would do and the second one does it.
 */
export function importLeads(input: { dryRun?: boolean } = {}): ImportResult {
  const dryRun = input.dryRun !== false;
  const book = readLeads();
  const result: ImportResult = { imported: [], known: [], unusable: [], dryRun };

  // Built once, from one read, and updated in memory as we go. Every write
  // below is synchronous with no await between the read and the write, which
  // is the whole of this codebase's concurrency design — an await in this loop
  // would throw that away and let two founders clobber each other.
  const existing = listClients();
  const bySlug = new Set(existing.map((c) => profileSlug(c.linkedin ?? "")).filter(Boolean));
  const byEmail = new Set(existing.map((c) => normaliseAddress(c.email ?? "")).filter(Boolean));
  const byName = new Set(existing.map((c) => `${c.name.trim().toLowerCase()}|${c.company.trim().toLowerCase()}`));

  for (const lead of book.leads) {
    const name = lead.name?.trim() ?? "";
    const company = lead.company?.trim() ?? "";
    if (!name || !company) {
      result.unusable.push({ name, company, why: "No name or no company." });
      continue;
    }

    // Profile first: it is the field every lead carries, and the one that
    // survives somebody changing jobs. http/https and www differ between
    // Apollo's export and the client book, so both go through the slug.
    const slug = profileSlug(lead.linkedin ?? "");
    const email = normaliseAddress(lead.email ?? "");
    const nameKey = `${name.toLowerCase()}|${company.toLowerCase()}`;

    const matched = slug && bySlug.has(slug)
      ? ("profile" as const)
      : email && byEmail.has(email)
        ? ("email" as const)
        : byName.has(nameKey)
          ? ("name" as const)
          : undefined;

    if (matched) {
      result.known.push({ name, company, matched });
      continue;
    }

    if (!dryRun) {
      // Six fields, named. Never a spread of the lead: addClient copies every
      // key it is handed straight onto disk, and apolloUrl, poolSize and the
      // rest have no business in the client book.
      // ponytail: addClient re-reads the file per call, so this is O(n^2) on a
      // 148-row import. Batch it if the book ever reaches thousands.
      addClient({
        name,
        company,
        stage: "lead",
        source: book.list.name ? `Apollo — ${book.list.name}` : "Apollo",
        role: lead.title?.trim() || undefined,
        email: lead.email?.trim() || undefined,
        linkedin: lead.linkedin?.trim() || undefined,
      });
    }

    if (slug) bySlug.add(slug);
    if (email) byEmail.add(email);
    byName.add(nameKey);
    result.imported.push({ name, company });
  }

  return result;
}
