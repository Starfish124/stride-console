import { NextResponse } from "next/server";
import { runRecipe } from "@/lib/pipeline/run";
import { EVENT_RECIPES, type RecipeId } from "@/lib/types";

const RECIPES: RecipeId[] = ["tldr", "news", "myth", ...EVENT_RECIPES];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ recipe: string }> },
) {
  const { recipe } = await params;
  if (!RECIPES.includes(recipe as RecipeId)) {
    return NextResponse.json({ error: "Unknown recipe." }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { eventId?: string };
  try {
    const draft = await runRecipe(recipe as RecipeId, { eventId: body.eventId });
    return NextResponse.json({ id: draft.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The run failed." },
      { status: 500 },
    );
  }
}
