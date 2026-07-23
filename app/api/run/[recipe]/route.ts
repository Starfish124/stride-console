import { NextResponse } from "next/server";
import { runRecipe } from "@/lib/pipeline/run";
import type { RecipeId } from "@/lib/types";

const RECIPES: RecipeId[] = ["tldr", "news", "myth"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ recipe: string }> },
) {
  const { recipe } = await params;
  if (!RECIPES.includes(recipe as RecipeId)) {
    return NextResponse.json({ error: "Unknown recipe." }, { status: 404 });
  }
  try {
    const draft = await runRecipe(recipe as RecipeId);
    return NextResponse.json({ id: draft.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The run failed." },
      { status: 500 },
    );
  }
}
