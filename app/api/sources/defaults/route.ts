import { NextResponse } from "next/server";
import { restoreDefaultSources } from "@/lib/store";

/** Fold newly shipped default sources into the saved list, keeping edits. */
export async function POST() {
  return NextResponse.json(restoreDefaultSources());
}
