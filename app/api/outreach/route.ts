import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  deleteSequence,
  listSequences,
  lintSequence,
  saveSequence,
  toLinkedHelperTemplate,
} from "@/lib/outreach/sequence";

export const dynamic = "force-dynamic";

export async function GET() {
  const sequences = listSequences().map((sequence) => ({
    ...sequence,
    verdict: lintSequence(sequence),
    template: toLinkedHelperTemplate(sequence),
  }));
  return NextResponse.json({ sequences });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    id?: string;
    name?: string;
    audience?: string;
    steps?: Array<{ id?: string; kind: "connect" | "message" | "inmail"; waitDays: number; body: string }>;
  };

  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: "A sequence needs at least one step." }, { status: 400 });
  }

  const sequence = saveSequence({
    id: body.id,
    name: body.name ?? "",
    audience: body.audience ?? "",
    steps: body.steps,
  });

  // Saving is always allowed. The gate reports; it does not refuse a draft,
  // because a founder mid-edit should not be locked out of their own words.
  return NextResponse.json({
    sequence,
    verdict: lintSequence(sequence),
    template: toLinkedHelperTemplate(sequence),
  });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which sequence?" }, { status: 400 });
  deleteSequence(id);
  return NextResponse.json({ ok: true });
}
