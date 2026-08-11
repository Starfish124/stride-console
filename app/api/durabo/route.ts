import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { appendNote, readLive, readNotes, readRoster, requireSlug, updateLive } from "@/lib/durabo/io";

// Both phones poll this during the interview days, so it answers from disk
// only — no model calls, no git.
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (slug) {
    try {
      return NextResponse.json({
        live: readLive().interviews[slug] ?? { checked: {} },
        notes: readNotes(slug),
      });
    } catch {
      return NextResponse.json({ error: "Not on the roster." }, { status: 404 });
    }
  }
  return NextResponse.json({ roster: readRoster(), live: readLive().interviews });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = typeof body.slug === "string" ? body.slug : "";
  const action = typeof body.action === "string" ? body.action : "";
  const jar = await cookies();
  const by = jar.get(FOUNDER_COOKIE)?.value;

  try {
    requireSlug(slug);
    switch (action) {
      case "start":
        updateLive(slug, (i) => {
          i.startedAt ??= new Date().toISOString();
          i.finishedAt = undefined;
          i.status = "live";
          i.by = by ?? i.by;
        });
        break;
      case "finish":
        updateLive(slug, (i) => {
          i.finishedAt = new Date().toISOString();
          i.status = "interviewed";
        });
        break;
      case "check": {
        const step = String(body.step ?? "");
        if (!step) return NextResponse.json({ error: "Which step." }, { status: 400 });
        updateLive(slug, (i) => {
          if (body.on) i.checked[step] = true;
          else delete i.checked[step];
        });
        break;
      }
      case "status": {
        const status = typeof body.status === "string" ? body.status : "";
        if (!status) return NextResponse.json({ error: "Which status." }, { status: 400 });
        updateLive(slug, (i) => {
          i.status = status;
        });
        break;
      }
      case "note": {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return NextResponse.json({ error: "Nothing to note." }, { status: 400 });
        appendNote(slug, text, by);
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Not on the roster." }, { status: 404 });
  }
  return NextResponse.json({ live: readLive().interviews[slug] ?? { checked: {} } });
}
