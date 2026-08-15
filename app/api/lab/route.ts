import { NextResponse } from "next/server";
import { createSandbox, sandboxViews } from "@/lib/lab/lab";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sandboxes: sandboxViews() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = createSandbox({
    name: typeof body.name === "string" ? body.name : "",
    image: typeof body.image === "string" ? body.image : "",
    port: typeof body.port === "number" ? body.port : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.problem }, { status: 400 });
  return NextResponse.json(result.sandbox);
}
