import { NextResponse } from "next/server";
import { listClients } from "@/lib/store";
import { listProjects } from "@/lib/workspace/store";
import { searchWorkspaces } from "@/lib/workspace/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "Type something to search for." }, { status: 400 });

  try {
    const hits = searchWorkspaces(q, { clientId: params.get("clientId") ?? undefined });
    // Name things here so the component stays dumb.
    const clients = new Map(listClients().map((c) => [c.id, c.company]));
    const projects = new Map(listProjects().map((p) => [p.id, p.name]));
    return NextResponse.json({
      hits: hits.map((hit) => ({
        ...hit,
        clientName: clients.get(hit.clientId) ?? "Unknown client",
        projectName: projects.get(hit.projectId) ?? "Unknown project",
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
