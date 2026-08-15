import { NextResponse } from "next/server";
import {
  addDeliverable,
  addItem,
  listDeliverables,
  removeDeliverable,
  tickItem,
  updateDeliverable,
  type DeliverableStatus,
} from "@/lib/build/deliverables";

export async function GET() {
  return NextResponse.json({ deliverables: listDeliverables() });
}

const STATUSES: DeliverableStatus[] = ["todo", "doing", "blocked", "done"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const id = typeof body.id === "string" ? body.id : "";

  switch (action) {
    case "add": {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return NextResponse.json({ error: "A title." }, { status: 400 });
      const d = addDeliverable({
        title,
        owner: typeof body.owner === "string" ? body.owner : undefined,
        due: typeof body.due === "string" ? body.due : undefined,
        deps: Array.isArray(body.deps) ? body.deps.filter((x) => typeof x === "string") : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
      });
      return NextResponse.json({ deliverable: d });
    }
    case "update": {
      const status = typeof body.status === "string" ? body.status : undefined;
      if (status && !STATUSES.includes(status as DeliverableStatus)) {
        return NextResponse.json({ error: "Not a status." }, { status: 400 });
      }
      const d = updateDeliverable(id, {
        title: typeof body.title === "string" ? body.title : undefined,
        status: status as DeliverableStatus | undefined,
        owner: typeof body.owner === "string" ? body.owner : undefined,
        due: typeof body.due === "string" ? body.due : undefined,
        deps: Array.isArray(body.deps) ? body.deps.filter((x) => typeof x === "string") : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
      });
      if (!d) return NextResponse.json({ error: "No such deliverable." }, { status: 404 });
      return NextResponse.json({ deliverable: d });
    }
    case "tick": {
      const itemId = typeof body.itemId === "string" ? body.itemId : "";
      const d = tickItem(id, itemId, Boolean(body.on));
      if (!d) return NextResponse.json({ error: "No such item." }, { status: 404 });
      return NextResponse.json({ deliverable: d });
    }
    case "addItem": {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (!label) return NextResponse.json({ error: "A label." }, { status: 400 });
      const d = addItem(id, label);
      if (!d) return NextResponse.json({ error: "No such deliverable." }, { status: 404 });
      return NextResponse.json({ deliverable: d });
    }
    case "remove": {
      if (!removeDeliverable(id)) {
        return NextResponse.json({ error: "No such deliverable." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
