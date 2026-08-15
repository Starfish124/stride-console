import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addScoutEvent, listScoutEvents, removeScoutEvent, updateScoutEvent } from "@/lib/store";
import {
  SCOUT_CATEGORIES,
  SCOUT_STATUSES,
  type ScoutCategory,
  type ScoutCriteria,
  type ScoutStatus,
} from "@/lib/types";
import { FOUNDER_COOKIE } from "@/lib/auth";

function category(value: unknown): ScoutCategory | undefined {
  return SCOUT_CATEGORIES.includes(value as ScoutCategory) ? (value as ScoutCategory) : undefined;
}

function status(value: unknown): ScoutStatus | undefined {
  return SCOUT_STATUSES.includes(value as ScoutStatus) ? (value as ScoutStatus) : undefined;
}

/** yyyy-mm-dd or nothing — a half-typed date sorts worse than no date. */
function isoDay(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Criteria come from range inputs, but the API is the contract: clamp here. */
function criteria(value: unknown): Partial<ScoutCriteria> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as Record<string, unknown>;
  const out: Partial<ScoutCriteria> = {};
  for (const key of ["audienceFit", "leadPotential", "visibility", "affordability"] as const) {
    const n = Number(source[key]);
    if (Number.isFinite(n)) out[key] = Math.min(5, Math.max(0, Math.round(n)));
  }
  return Object.keys(out).length ? out : undefined;
}

export async function GET() {
  return NextResponse.json(listScoutEvents());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = text(body.name);
  if (!name) return NextResponse.json({ error: "Which event." }, { status: 400 });
  const jar = await cookies();
  const event = addScoutEvent({
    name,
    url: text(body.url),
    date: isoDay(body.date),
    endDate: isoDay(body.endDate),
    location: text(body.location),
    category: category(body.category) ?? "other",
    cost: text(body.cost),
    notes: text(body.notes),
    criteria: criteria(body.criteria),
    by: jar.get(FOUNDER_COOKIE)?.value,
  });
  return NextResponse.json(event);
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which event." }, { status: 400 });

  const patch: Parameters<typeof updateScoutEvent>[1] = {};
  if (text(body.name)) patch.name = text(body.name);
  if ("url" in body) patch.url = text(body.url);
  if ("date" in body) patch.date = isoDay(body.date);
  if ("endDate" in body) patch.endDate = isoDay(body.endDate);
  if ("location" in body) patch.location = text(body.location);
  if ("cost" in body) patch.cost = text(body.cost);
  if ("notes" in body) patch.notes = text(body.notes);
  const cat = category(body.category);
  if (cat) patch.category = cat;
  const st = status(body.status);
  if (st) patch.status = st;
  const crit = criteria(body.criteria);
  if (crit) patch.criteria = crit;

  const event = updateScoutEvent(id, patch);
  if (!event) return NextResponse.json({ error: "No such event." }, { status: 404 });
  return NextResponse.json(event);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!removeScoutEvent(id)) {
    return NextResponse.json({ error: "No such event." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
