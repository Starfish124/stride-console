import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  addBlueprint,
  listBlueprints,
  recordBlueprintUse,
  removeBlueprint,
  updateBlueprint,
} from "@/lib/store";
import { BLUEPRINT_KINDS, type BlueprintKind } from "@/lib/types";
import { FOUNDER_COOKIE } from "@/lib/auth";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function kind(value: unknown): BlueprintKind | undefined {
  return BLUEPRINT_KINDS.includes(value as BlueprintKind) ? (value as BlueprintKind) : undefined;
}

function stack(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

export async function GET() {
  return NextResponse.json(listBlueprints());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Logging a reuse is the hot path: one tap when work gets copied.
  if (body.action === "use") {
    const id = typeof body.id === "string" ? body.id : "";
    const client = text(body.client);
    if (!id || !client) return NextResponse.json({ error: "Which blueprint, which client." }, { status: 400 });
    const used = recordBlueprintUse(id, client);
    if (!used) return NextResponse.json({ error: "No such blueprint." }, { status: 404 });
    return NextResponse.json(used);
  }

  const name = text(body.name);
  const oneLiner = text(body.oneLiner);
  const payload = text(body.payload);
  if (!name || !oneLiner || !payload) {
    return NextResponse.json({ error: "Name, one-liner and the payload are the minimum." }, { status: 400 });
  }
  const jar = await cookies();
  const blueprint = addBlueprint({
    name,
    kind: kind(body.kind) ?? "workflow",
    oneLiner,
    problem: text(body.problem) ?? "",
    solution: text(body.solution) ?? "",
    stack: stack(body.stack),
    builtFor: text(body.builtFor) ?? "",
    payload,
    by: jar.get(FOUNDER_COOKIE)?.value,
  });
  return NextResponse.json(blueprint);
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which blueprint." }, { status: 400 });

  const patch: Parameters<typeof updateBlueprint>[1] = {};
  if (text(body.name)) patch.name = text(body.name);
  if (text(body.oneLiner)) patch.oneLiner = text(body.oneLiner);
  if ("problem" in body) patch.problem = text(body.problem) ?? "";
  if ("solution" in body) patch.solution = text(body.solution) ?? "";
  if ("builtFor" in body) patch.builtFor = text(body.builtFor) ?? "";
  if ("stack" in body) patch.stack = stack(body.stack);
  if (text(body.payload)) patch.payload = text(body.payload);
  const k = kind(body.kind);
  if (k) patch.kind = k;
  if (body.status === "proven" || body.status === "experimental") patch.status = body.status;

  const blueprint = updateBlueprint(id, patch);
  if (!blueprint) return NextResponse.json({ error: "No such blueprint." }, { status: 404 });
  return NextResponse.json(blueprint);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!removeBlueprint(id)) {
    return NextResponse.json({ error: "No such blueprint." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
