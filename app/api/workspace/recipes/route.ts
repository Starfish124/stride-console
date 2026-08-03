import { NextResponse } from "next/server";
import { newId } from "@/lib/store";
import { deleteRecipe, listRecipes, putRecipe } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listRecipes());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const task = typeof body.task === "string" ? body.task.trim().slice(0, 4000) : "";
  if (!name) return NextResponse.json({ error: "A recipe needs a name." }, { status: 400 });
  if (!task) return NextResponse.json({ error: "A recipe needs its task." }, { status: 400 });
  const recipe = { id: newId("recipe"), name, task };
  putRecipe(recipe);
  return NextResponse.json(recipe);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (id.startsWith("builtin-")) {
    return NextResponse.json({ error: "Built-in recipes can't be removed." }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });
  deleteRecipe(id);
  return NextResponse.json({ ok: true });
}
