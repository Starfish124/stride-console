import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { enrol, enrolMany, pause, resume, withdraw } from "@/lib/salesnav/enrol";
import { listEnrolments } from "@/lib/salesnav/store";
import type { LawfulBasis } from "@/lib/salesnav/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enrolments: listEnrolments() });
}

/**
 * Enrol one person, or a batch.
 *
 * The batch takes ONE reason and writes it verbatim onto every enrolment. That
 * is a real weakening of what enrol() asks for — it wants a sentence about this
 * person specifically — and it is done with eyes open, because the alternative
 * founders actually reach for is pasting the same sentence twenty times, which
 * is the same weakening with more typing and no record that it was a batch.
 *
 * What is not weakened: the reason is still typed by a human, still measured
 * against the minimum, and still stored on every row with who typed it. It is
 * never pre-filled, and the screen says the reason covers the whole batch.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    clientId?: string;
    clientIds?: string[];
    sequenceId?: string;
    basis?: Partial<LawfulBasis>;
  };
  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";

  if (Array.isArray(body.clientIds)) {
    const ids = body.clientIds.filter((id) => typeof id === "string" && id);
    if (!ids.length) return NextResponse.json({ error: "Nobody selected." }, { status: 400 });
    const { enrolled, refused } = enrolMany({
      clientIds: ids,
      sequenceId: body.sequenceId ?? "",
      basis: body.basis ?? {},
      by: who,
    });
    return NextResponse.json({ enrolled: enrolled.length, refused });
  }

  const result = enrol({
    clientId: body.clientId ?? "",
    sequenceId: body.sequenceId ?? "",
    basis: body.basis ?? {},
    by: who,
  });

  // The exact field, so the form can point at the thing to fix rather than
  // saying the request was bad.
  if (!result.ok) {
    return NextResponse.json({ error: result.problem, field: result.field }, { status: 400 });
  }
  return NextResponse.json({ enrolment: result.enrolment });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { id?: string; state?: string };
  if (!body.id) return NextResponse.json({ error: "Which enrolment." }, { status: 400 });

  const enrolment =
    body.state === "paused" ? pause(body.id) : body.state === "active" ? resume(body.id) : undefined;
  if (!enrolment) {
    return NextResponse.json({ error: "Send state: paused or state: active." }, { status: 400 });
  }
  return NextResponse.json({ enrolment });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which enrolment." }, { status: 400 });
  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";
  const enrolment = withdraw(id, `Withdrawn by ${who}.`);
  if (!enrolment) return NextResponse.json({ error: "No such enrolment." }, { status: 404 });
  return NextResponse.json({ enrolment });
}
