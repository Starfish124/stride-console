import { NextResponse } from "next/server";
import { addClient, listClients } from "@/lib/store";
import { CLIENT_STAGES, type ClientStage } from "@/lib/types";

export async function GET() {
  return NextResponse.json(listClients());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!name && !company) {
    return NextResponse.json(
      { error: "A name or a company, at least." },
      { status: 400 },
    );
  }

  const stage = CLIENT_STAGES.includes(body.stage as ClientStage)
    ? (body.stage as ClientStage)
    : "lead";

  // Value arrives from a form field, so it can be "", "12k", or nonsense.
  // Anything that is not a real non-negative number is simply not a value.
  const parsed = Number(body.value);
  const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;

  const str = (k: string) =>
    typeof body[k] === "string" && (body[k] as string).trim()
      ? (body[k] as string).trim()
      : undefined;

  const client = addClient({
    // A lead is often a company before it is a person, and just as often the
    // reverse. Whichever one is missing borrows the other rather than showing
    // an empty row.
    name: name || company,
    company: company || name,
    stage,
    value,
    role: str("role"),
    email: str("email"),
    linkedin: str("linkedin"),
    source: str("source"),
    need: str("need"),
    proposed: str("proposed"),
    owner: str("owner"),
    nextStep: str("nextStep"),
    nextStepNote: str("nextStepNote"),
  });
  return NextResponse.json(client);
}
