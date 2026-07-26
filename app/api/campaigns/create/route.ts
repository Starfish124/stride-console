import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createCampaign } from "@/lib/channels/linkedHelper";
import { findTemplate } from "@/lib/outreach/templates";

export const dynamic = "force-dynamic";

/**
 * Make a campaign in Linked Helper.
 *
 * Creating one sends nothing: every template arrives paused with its steps
 * unarmed. The template name is checked against the catalogue here so a typo
 * fails before the wizard is opened rather than half way through it.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; template?: string };
  const name = (body.name ?? "").trim();
  const template = (body.template ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "no_name", detail: "Give the campaign a name." }, { status: 400 });
  }
  if (!findTemplate(template)) {
    return NextResponse.json(
      { error: "unknown_template", detail: `No template called "${template}".` },
      { status: 400 },
    );
  }

  const result = await createCampaign(name, template);
  return NextResponse.json(result.body, { status: result.status });
}
