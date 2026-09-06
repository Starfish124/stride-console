import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pullLeads, readIcp, saveIcp, apolloConfigured, searchPeople } from "@/lib/apollo";

export const dynamic = "force-dynamic";
// Revealing twenty-five people is twenty-five round trips to Apollo with a
// deliberate pause between them, so this outlives the default budget.
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ icp: readIcp(), configured: apolloConfigured() });
}

const list = (v: unknown) =>
  Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : undefined;

/** The search a request is describing, or nothing if it did not describe one. */
function icpFrom(body: Record<string, unknown>) {
  return {
    titles: list(body.titles),
    locations: list(body.locations),
    employeeRanges: list(body.employeeRanges),
    keywords: list(body.keywords),
    perRun: typeof body.perRun === "number" ? body.perRun : undefined,
  };
}

/** Change the ICP. Never spends anything. */
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json({
    icp: saveIcp({
      ...icpFrom(body),
    }),
  });
}

/**
 * Pull now, by hand.
 *
 * Dry unless the caller says confirm, so the button can answer "how many and
 * what would it cost" without costing anything. The scheduled job at 09:30
 * does the same thing unattended, inside the same ceiling.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
    confirm?: boolean;
    max?: number;
    count?: boolean;
  };

  // The search the caller is LOOKING AT, not the one last saved.
  //
  // This read the ICP off disk and ignored the request entirely, so editing the
  // titles and pressing "see what it would cost" quoted the old search — and
  // then spent credits on it. A price for a query nobody is looking at is worse
  // than no price, because it is acted on.
  const asked = icpFrom(body);

  // Just the size of the pool, for the count that moves while somebody edits
  // the search. One page, no walk, and searching costs nothing — so the number
  // can follow the chips instead of waiting for a button.
  if (body.count === true) {
    const icp = { ...readIcp(), ...pruned(asked) };
    const found = await searchPeople(icp, 1, 1);
    return NextResponse.json(
      found.ok ? { ok: true, pool: found.total } : { ok: false, problem: found.problem },
      { status: found.ok ? 200 : 502 },
    );
  }
  const described = Object.values(asked).some((v) => v !== undefined);
  const icp = described ? { ...readIcp(), ...pruned(asked) } : undefined;

  const result = await pullLeads({
    icp,
    dryRun: body.confirm !== true,
    max: typeof body.max === "number" ? body.max : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

/** Drop the keys the caller left out, so they fall back to what is saved. */
function pruned<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
