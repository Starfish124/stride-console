import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addTouch, getClient, removeClient, updateClient } from "@/lib/store";
import { CLIENT_STAGES, type Client, type ClientStage } from "@/lib/types";
import { FOUNDER_COOKIE } from "@/lib/auth";

/** Only these move through the API. Id, touches and createdAt are not the caller's. */
const PATCHABLE = [
  "name",
  "company",
  "stage",
  "source",
  "role",
  "email",
  "linkedin",
  "need",
  "proposed",
  "owner",
  "nextStep",
  "nextStepNote",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) return NextResponse.json({ error: "No such client." }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // A touch is an append, not a field, so it takes its own branch — two
  // founders adding one at the same moment must not overwrite each other.
  if (typeof body.touch === "string" && body.touch.trim()) {
    const jar = await cookies();
    const updated = addTouch(id, {
      note: body.touch,
      who: jar.get(FOUNDER_COOKIE)?.value,
    });
    if (!updated) return NextResponse.json({ error: "No such client." }, { status: 404 });
    return NextResponse.json(updated);
  }

  const patch: Partial<Client> = {};
  for (const key of PATCHABLE) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (key === "stage") {
      if (CLIENT_STAGES.includes(raw as ClientStage)) patch.stage = raw as ClientStage;
      continue;
    }
    if (typeof raw !== "string") continue;
    // An emptied field clears rather than stores "", so the UI can tell the
    // difference between "not said yet" and "said, and it is blank".
    const trimmed = raw.trim();
    (patch as Record<string, string | undefined>)[key] = trimmed || undefined;
  }

  if ("value" in body) {
    const parsed = Number(body.value);
    patch.value = Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  const updated = updateClient(id, patch);
  if (!updated) return NextResponse.json({ error: "No such client." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!removeClient(id)) {
    return NextResponse.json({ error: "No such client." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
