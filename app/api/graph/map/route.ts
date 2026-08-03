import { NextResponse } from "next/server";
import { findNodes, graphMap, neighbourhood } from "@/lib/graph/map";

export const dynamic = "force-dynamic";

/**
 * The graph as something readable: the whole map, one node's neighbourhood,
 * or a search. Behind the console login like the rest of the graph.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const node = params.get("node");
  if (node) {
    const found = neighbourhood(node);
    if (!found) return NextResponse.json({ error: "No such node." }, { status: 404 });
    return NextResponse.json(found);
  }

  const query = params.get("q");
  if (query) return NextResponse.json({ hits: findNodes(query) });

  return NextResponse.json(graphMap());
}
