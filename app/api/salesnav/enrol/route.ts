import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { enrol, pause, resume, withdraw } from "@/lib/salesnav/enrol";
import { listEnrolments } from "@/lib/salesnav/store";
import type { LawfulBasis } from "@/lib/salesnav/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enrolments: listEnrolments() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    clientId?: string;
    sequenceId?: string;
    basis?: Partial<LawfulBasis>;
  };
  const jar = await cookies();
  const who = jar.get(FOUNDER_COOKIE)?.value ?? "Unknown";

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
