// Google Search Console connector.
//
// This is the only source of real click, impression and ranking data, and it
// is what turns the keyword organiser from a guess into a measurement: it
// reports the exact queries people used, where the site ranked, and how often
// they clicked.
//
// Auth is a service account. No OAuth dance, no refresh token to expire, no
// browser step at 3am. The JWT is signed with node:crypto, so there is no
// googleapis dependency for what is two HTTP calls.
//
// When credentials are absent every function says so plainly. Nothing here
// ever returns a plausible-looking zero, because a dashboard that shows 0
// clicks is indistinguishable from one showing "not measured" and the two mean
// completely different things.

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import type { Locale } from "./types.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://searchconsole.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface GscStatus {
  configured: boolean;
  reason?: string;
  clientEmail?: string;
  siteUrl?: string;
}

/**
 * Where the key lives. A path in the env wins; otherwise data/gsc-key.json,
 * which is gitignored along with the rest of data/.
 */
export function keyPath(): string {
  return (
    process.env.GSC_SERVICE_ACCOUNT_KEY ??
    path.join(process.cwd(), "data", "gsc-key.json")
  );
}

/** The property as registered in Search Console. */
export function siteUrl(): string {
  return process.env.GSC_SITE_URL ?? "sc-domain:stride-ai.nl";
}

export function loadServiceAccount(): ServiceAccount | undefined {
  try {
    const raw = fs.readFileSync(keyPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return undefined;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return undefined;
  }
}

export function status(): GscStatus {
  const account = loadServiceAccount();
  if (!account) {
    // Relative on purpose. This reason is rendered verbatim on /seo, and /seo
    // gets shown to clients, so an absolute path would put someone's home
    // directory on a stranger's screen. It stays just as actionable.
    const where = path.relative(process.cwd(), keyPath()) || keyPath();
    return {
      configured: false,
      reason: `No service account key at ${where}. See docs/SEO.md for the five-minute setup.`,
    };
  }
  return { configured: true, clientEmail: account.client_email, siteUrl: siteUrl() };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Signed JWT assertion for the service account. */
export function buildAssertion(account: ServiceAccount, now = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  );
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(account.private_key);
  return `${header}.${claims}.${base64url(signature)}`;
}

let cachedToken: { token: string; expiresAt: number } | undefined;

export async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const account = loadServiceAccount();
  if (!account) throw new Error("Search Console is not configured");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion(account),
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google returned no access token");

  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/** For tests: forget the cached token. */
export function resetTokenCache(): void {
  cachedToken = undefined;
}

export interface QueryRow {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchStats {
  available: boolean;
  reason?: string;
  from: string;
  to: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  queries: QueryRow[];
  pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
}

export function emptyStats(from: string, to: string, reason: string): SearchStats {
  return {
    available: false,
    reason,
    from,
    to,
    totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    queries: [],
    pages: [],
  };
}

export function dateRange(
  days: number,
  now = new Date(),
  /** Shift the whole window back this many days, for a previous-period read. */
  shiftDays = 0,
): { from: string; to: string } {
  // Search Console data lags roughly two days, so a window ending today is
  // mostly empty and reads as a traffic collapse.
  const day = 24 * 60 * 60 * 1000;
  const end = new Date(now.getTime() - (2 + shiftDays) * day);
  const start = new Date(end.getTime() - days * day);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

async function queryApi(
  body: Record<string, unknown>,
): Promise<{ rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[] }> {
  const token = await accessToken();
  const res = await fetch(
    `${API}/sites/${encodeURIComponent(siteUrl())}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Search Console query failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as Awaited<ReturnType<typeof queryApi>>;
}

/**
 * Pull the last `days` of search performance, by query and by page.
 *
 * Never throws. A missing key, a revoked permission or a Google outage all
 * come back as available:false with the reason attached, because this runs
 * inside a nightly sweep that must finish either way.
 */
export async function fetchStats(
  days = 28,
  now = new Date(),
  options: { shiftDays?: number } = {},
): Promise<SearchStats> {
  const { from, to } = dateRange(days, now, options.shiftDays ?? 0);

  const check = status();
  if (!check.configured) return emptyStats(from, to, check.reason ?? "not configured");

  try {
    const [queryRes, pageRes] = await Promise.all([
      queryApi({ startDate: from, endDate: to, dimensions: ["query"], rowLimit: 500 }),
      queryApi({ startDate: from, endDate: to, dimensions: ["page"], rowLimit: 200 }),
    ]);

    const queries: QueryRow[] = (queryRes.rows ?? []).map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));

    const pages = (pageRes.rows ?? []).map((r) => ({
      page: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));

    const clicks = queries.reduce((s, q) => s + q.clicks, 0);
    const impressions = queries.reduce((s, q) => s + q.impressions, 0);

    return {
      available: true,
      from,
      to,
      totals: {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        // Average position weighted by impressions. The unweighted mean lets a
        // term with three impressions at position 2 outweigh one with three
        // thousand at position 40.
        position:
          impressions > 0
            ? queries.reduce((s, q) => s + q.position * q.impressions, 0) / impressions
            : 0,
      },
      queries,
      pages,
    };
  } catch (error) {
    return emptyStats(from, to, error instanceof Error ? error.message : String(error));
  }
}

export interface DayRow {
  date: string;
  clicks: number;
  impressions: number;
}

/**
 * Clicks and impressions per day, for the trend.
 *
 * Days Google reports nothing for are absent from its response rather than
 * zero, so the series is filled in here — a line that skips a quiet Sunday
 * draws a slope through it and invents traffic that never happened.
 */
export async function fetchDaily(days = 28, now = new Date()): Promise<DayRow[]> {
  const { from, to } = dateRange(days, now);
  if (!status().configured) return [];

  try {
    const res = await queryApi({
      startDate: from,
      endDate: to,
      dimensions: ["date"],
      rowLimit: 500,
    });
    const byDate = new Map(
      (res.rows ?? []).map((r) => [
        r.keys?.[0] ?? "",
        { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 },
      ]),
    );

    const out: DayRow[] = [];
    const day = 24 * 60 * 60 * 1000;
    for (let t = Date.parse(from); t <= Date.parse(to); t += day) {
      const date = new Date(t).toISOString().slice(0, 10);
      const row = byDate.get(date);
      out.push({ date, clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 });
    }
    return out;
  } catch {
    // The dashboard still has totals; a missing trend is not worth an error
    // card of its own.
    return [];
  }
}

/** Match Search Console queries onto stored keywords by normalised term. */
export function statsByTerm(stats: SearchStats): Map<string, QueryRow> {
  const map = new Map<string, QueryRow>();
  for (const row of stats.queries) {
    const key = row.query.toLowerCase().trim();
    if (key) map.set(key, row);
  }
  return map;
}

/** Which locale a Search Console page URL belongs to. */
export function localeOfPage(page: string): Locale {
  try {
    return new URL(page).pathname.startsWith("/nl/") ? "nl" : "en";
  } catch {
    return "en";
  }
}
