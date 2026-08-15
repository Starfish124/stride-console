import { NextResponse } from "next/server";
import {
  addNeed,
  addPrototype,
  listPrototypes,
  removePrototype,
  tickNeed,
} from "@/lib/build/prototypes";

export async function GET() {
  return NextResponse.json({ prototypes: listPrototypes() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const id = typeof body.id === "string" ? body.id : "";

  switch (action) {
    case "add": {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "A name." }, { status: 400 });
      const p = addPrototype({
        name,
        dir: typeof body.dir === "string" ? body.dir : undefined,
        repo: typeof body.repo === "string" ? body.repo : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
      });
      return NextResponse.json({ prototype: p });
    }
    case "tick": {
      const needId = typeof body.needId === "string" ? body.needId : "";
      const p = tickNeed(id, needId, Boolean(body.on));
      if (!p) return NextResponse.json({ error: "No such need." }, { status: 404 });
      return NextResponse.json({ prototype: p });
    }
    case "addNeed": {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (!label) return NextResponse.json({ error: "A label." }, { status: 400 });
      const p = addNeed(id, label);
      if (!p) return NextResponse.json({ error: "No such prototype." }, { status: 404 });
      return NextResponse.json({ prototype: p });
    }
    case "remove": {
      if (!removePrototype(id)) {
        return NextResponse.json({ error: "No such prototype." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
