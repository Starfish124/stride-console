import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pullLeads, readIcp, saveIcp, apolloConfigured } from "@/lib/apollo";

export const dynamic = "force-dynamic";
// Revealing twenty-five people is twenty-five round trips to Apollo with a
// deliberate pause between them, so this outlives the default budget.
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ icp: readIcp(), configured: apolloConfigured() });
}

/** Change the ICP. Never spends anything. */
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : undefined;
  return NextResponse.json({
    icp: saveIcp({
      titles: list(body.titles),
      locations: list(body.locations),
      employeeRanges: list(body.employeeRanges),
      keywords: list(body.keywords),
      perRun: typeof body.perRun === "number" ? body.perRun : undefined,
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
  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean; max?: number };
  const result = await pullLeads({
    dryRun: body.confirm !== true,
    max: typeof body.max === "number" ? body.max : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
