// The console's own Apollo client.
//
// lib/leads.ts used to say there was deliberately no client here, because the
// account's access was an OAuth session rather than a key this server holds.
// A key exists now, so this is that file — and readLeads stays exactly what it
// was: a pure read over the book on disk. Nothing on a page waits on Apollo.
//
// What the API actually gives you, measured rather than assumed:
//
//   search   free, 2000/day and 200/minute. Returns an id, a first name, a
//            title, the organisation, and has_email/has_city style booleans.
//            The LAST NAME IS OBFUSCATED and there is no address and no
//            LinkedIn URL. It is a teaser, not a lead.
//   enrich   one credit per person, measured against the balance either side
//            of a single call. Returns the full name, email, email_status,
//            linkedin_url, city, country and the organisation.
//
// So the shape is forced and it happens to be the right one: sift for nothing,
// pay only for the people who survive the sift. The one rule that keeps that
// honest is never enriching an id already in the book — Lead.id IS the Apollo
// person id, so that check costs nothing and saves a credit every time.

import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "./store.ts";
import { readLeads, writeLeads } from "./leads.ts";
import type { Lead } from "./leads.ts";

export const ICP_FILE = path.join(DATA_DIR, "apollo-icp.json");
const API = "https://api.apollo.io/api/v1";

/** Who we are looking for, and how much may be spent looking. */
export interface Icp {
  titles: string[];
  locations: string[];
  /** Apollo's own spelling of a headcount band, e.g. "51,200". */
  employeeRanges: string[];
  /**
   * Industry words matched against the company, not the person.
   *
   * Without these the same titles and headcount match 7,018 people in the
   * Netherlands — every industry there is. The vertical is the point, so this
   * is what makes the list Stride's list rather than a list. Measured: adding
   * them takes it to 2,554.
   *
   * q_organization_keyword_tags, not q_keywords — the latter searches
   * everything and matched Rabobank Wholesale & Rural on the word wholesale.
   */
  keywords: string[];
  /**
   * The hard ceiling on credits one pull may spend.
   *
   * Not a preference. The saved ICP already matches thousands of people and
   * the account holds a finite number of credits, so an unattended pull with a
   * slightly too wide filter is an unbounded spend against a paid API. Same
   * shape as the daily send cap: the job does what it can inside the number
   * and stops, rather than doing everything it could.
   */
  perRun: number;
}

const DEFAULT_ICP: Icp = {
  titles: [
    "Operations Director", "Operations Manager",
    "Finance Director", "Finance Manager",
    "IT Director", "IT Manager",
  ],
  locations: ["Netherlands"],
  employeeRanges: ["51,200", "201,500"],
  keywords: ["wholesale", "logistics", "import export"],
  perRun: 25,
};

export function readIcp(): Icp {
  const saved = readJson<Partial<Icp>>(ICP_FILE, {});
  return {
    titles: saved.titles?.length ? saved.titles : DEFAULT_ICP.titles,
    locations: saved.locations?.length ? saved.locations : DEFAULT_ICP.locations,
    employeeRanges: saved.employeeRanges?.length ? saved.employeeRanges : DEFAULT_ICP.employeeRanges,
    keywords: saved.keywords?.length ? saved.keywords : DEFAULT_ICP.keywords,
    // A saved 0 means "spend nothing", which is a legitimate way to pause the
    // scheduled pull without unloading the job, so it is kept rather than
    // treated as missing.
    perRun: typeof saved.perRun === "number" && saved.perRun >= 0 ? saved.perRun : DEFAULT_ICP.perRun,
  };
}

export function saveIcp(patch: Partial<Icp>): Icp {
  const next = { ...readIcp(), ...patch };
  next.perRun = Math.max(0, Math.min(500, Math.floor(next.perRun)));
  writeJson(ICP_FILE, next);
  return next;
}

export function apolloConfigured(): boolean {
  return !!process.env.APOLLO_API_KEY;
}

async function call<T>(path: string, body: unknown): Promise<{ ok: true; json: T } | { ok: false; problem: string; status: number }> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return { ok: false, problem: "APOLLO_API_KEY is not set.", status: 0 };
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // 401 and 403 mean different things and the difference decides whether
      // to fix a key or stop trying. Say which rather than "request failed".
      const why =
        res.status === 401 ? "Apollo rejected the API key."
        : res.status === 403 ? "This Apollo plan is not allowed to do that."
        : res.status === 429 ? "Apollo rate limit reached. It resets on the hour."
        : `Apollo said ${res.status}.`;
      return { ok: false, problem: `${why} ${text.slice(0, 160)}`.trim(), status: res.status };
    }
    return { ok: true, json: JSON.parse(text) as T };
  } catch (e) {
    return { ok: false, problem: `Could not reach Apollo: ${(e as Error).message}`, status: 0 };
  }
}

/** One row of the free search: enough to decide, not enough to contact. */
export interface Teaser {
  id: string;
  title: string;
  company: string;
  hasEmail: boolean;
}

export async function searchPeople(icp: Icp, page = 1, perPage = 100): Promise<
  { ok: true; total: number; people: Teaser[] } | { ok: false; problem: string }
> {
  const res = await call<{ total_entries?: number; people?: Record<string, unknown>[] }>(
    "/mixed_people/api_search",
    {
      person_titles: icp.titles,
      person_locations: icp.locations,
      organization_num_employees_ranges: icp.employeeRanges,
      q_organization_keyword_tags: icp.keywords,
      per_page: perPage,
      page,
    },
  );
  if (!res.ok) return { ok: false, problem: res.problem };
  const people = (res.json.people ?? []).map((p) => ({
    id: String(p.id ?? ""),
    title: String(p.title ?? ""),
    company: String((p.organization as { name?: string } | undefined)?.name ?? ""),
    hasEmail: p.has_email === true,
  })).filter((p) => p.id);
  return { ok: true, total: Number(res.json.total_entries ?? 0), people };
}

/**
 * Apollo's person shape, as a Lead. Pure, so it can be tested without paying.
 *
 * Split out from enrichPerson because the interesting decisions are all here —
 * chiefly what counts as an address — and a rule about data quality that can
 * only be exercised by spending a credit is a rule nobody checks.
 */
export function leadFromPerson(p: Record<string, unknown>, fallbackId = ""): Lead {
  const org = (p.organization ?? {}) as Record<string, unknown>;
  const email = String(p.email ?? "");
  return {
    id: String(p.id ?? fallbackId),
    name: String(p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`).trim(),
    title: String(p.title ?? ""),
    company: String(org.name ?? ""),
    companyDomain: String(org.primary_domain ?? org.website_url ?? ""),
    employees: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    industry: String(org.industry ?? ""),
    city: String(p.city ?? ""),
    country: String(p.country ?? ""),
    // A locked placeholder is not an address. Storing it would put
    // "email_not_unlocked@domain.com" in front of the sequencer, which reads
    // as contactable and is not.
    email: email && !email.includes("not_unlocked") ? email : "",
    emailStatus: String(p.email_status ?? ""),
    linkedin: String(p.linkedin_url ?? ""),
    apolloUrl: `https://app.apollo.io/#/people/${String(p.id ?? fallbackId)}`,
  };
}

/** The call that costs a credit. One person, all the fields worth having. */
export async function enrichPerson(id: string): Promise<{ ok: true; lead: Lead } | { ok: false; problem: string }> {
  const res = await call<{ person?: Record<string, unknown> }>("/people/match", {
    id,
    // Personal addresses are a different consent question from a work address
    // and are not what this outbound is for.
    reveal_personal_emails: false,
  });
  if (!res.ok) return { ok: false, problem: res.problem };
  const p = res.json.person;
  if (!p) return { ok: false, problem: "Apollo returned no person for that id." };
  return { ok: true, lead: leadFromPerson(p, id) };
}

export interface PullResult {
  ok: boolean;
  problem?: string;
  /** How many the ICP matches in Apollo, which is not how many we took. */
  pool: number;
  /** Seen in search and skipped because the book already has them. Free. */
  alreadyHeld: number;
  /** Skipped because Apollo has no address for them. Free. */
  noEmail: number;
  /** Enriched. This is the credit spend, one each. */
  enriched: number;
  added: number;
  ceiling: number;
  dryRun: boolean;
}

/**
 * Top the lead book up, inside the ceiling.
 *
 * Search first and sift for free: anyone already in the book is skipped before
 * a credit is spent, which is the whole reason Lead.id is Apollo's own id
 * rather than one of ours. Only what survives is enriched, one credit each,
 * and never more than the ceiling however wide the filter turns out to be.
 */
export async function pullLeads(input: {
  max?: number;
  dryRun?: boolean;
  icp?: Icp;
  /**
   * The two calls, injectable.
   *
   * Not indirection for its own sake: this function decides how many credits
   * leave the account, and a decision about money that can only be tested by
   * spending money is not tested. The defaults are the real calls.
   */
  search?: typeof searchPeople;
  enrich?: typeof enrichPerson;
} = {}): Promise<PullResult> {
  const search = input.search ?? searchPeople;
  const enrich = input.enrich ?? enrichPerson;
  const icp = input.icp ?? readIcp();
  const dryRun = input.dryRun === true;
  const ceiling = Math.max(0, Math.min(input.max ?? icp.perRun, icp.perRun));
  const out: PullResult = { ok: true, pool: 0, alreadyHeld: 0, noEmail: 0, enriched: 0, added: 0, ceiling, dryRun };

  if (!apolloConfigured()) return { ...out, ok: false, problem: "APOLLO_API_KEY is not set." };
  if (ceiling === 0) return { ...out, problem: "The per-run ceiling is zero, so nothing was searched." };

  const book = readLeads();
  const held = new Set(book.leads.map((l) => l.id));
  const wanted: Teaser[] = [];

  // Walk pages until the ceiling is filled or Apollo runs out. Search is free,
  // so paging past people we already hold costs nothing but time.
  for (let page = 1; page <= 10 && wanted.length < ceiling; page += 1) {
    const found = await search(icp, page);
    if (!found.ok) return { ...out, ok: false, problem: found.problem };
    if (page === 1) out.pool = found.total;
    if (!found.people.length) break;

    for (const person of found.people) {
      if (held.has(person.id)) { out.alreadyHeld += 1; continue; }
      if (!person.hasEmail) { out.noEmail += 1; continue; }
      if (wanted.length >= ceiling) break;
      wanted.push(person);
      held.add(person.id);
    }
  }

  if (dryRun) return { ...out, enriched: 0, added: wanted.length };

  const fresh: Lead[] = [];
  for (const person of wanted) {
    const got = await enrich(person.id);
    out.enriched += 1;
    if (!got.ok) {
      // Stop rather than grind through a whole ceiling of failures: a bad key
      // or a spent rate limit fails identically for every remaining id, and
      // each attempt may still cost.
      out.problem = got.problem;
      break;
    }
    if (got.lead.email) fresh.push(got.lead);
    if (!input.enrich) await new Promise((r) => setTimeout(r, 250));
  }

  if (fresh.length) {
    writeLeads({
      ...book,
      leads: [...book.leads, ...fresh],
      exportedAt: new Date().toISOString(),
      poolSize: out.pool || book.poolSize,
    });
  }
  out.added = fresh.length;
  return out;
}
