import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { getProject } from "@/lib/workspace/store";
import { runProject } from "@/lib/workspace/run";

export const dynamic = "force-dynamic";
// A deep run is allowed the same budget as salesnav research.
export const maxDuration = 800;

/**
 * Start a Claude Code run and stream its transcript as it happens.
 *
 * Same shape as /api/ask: plain text chunks through a ReadableStream, with
 * X-Accel-Buffering off so the Funnel does not hold the stream back into one
 * lump. The persisted record (with the diff) is fetched afterwards from
 * /api/workspace/runs/<id> — the id rides in the X-Run-Id header.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const task = typeof body.task === "string" ? body.task.trim() : "";
  if (!task) {
    return NextResponse.json({ error: "Say what the run should do." }, { status: 400 });
  }
  const full = body.full === true;
  const jar = await cookies();
  const by = jar.get(FOUNDER_COOKIE)?.value;

  // The stream may not exist yet when the first lines arrive; buffer until
  // it does. Enqueue after a client disconnect throws, hence the try.
  let push: ((line: string) => void) | null = null;
  const buffered: string[] = [];
  const onLine = (line: string) => {
    if (push) push(line);
    else buffered.push(line);
  };

  const started = runProject({ project, task, by, full, onLine });
  if (!started.ok) {
    return NextResponse.json({ error: started.problem }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      push = (line) => {
        try {
          controller.enqueue(encoder.encode(line + "\n"));
        } catch {
          push = null;
        }
      };
      for (const line of buffered) push(line);
      started.done
        .then((run) => {
          push?.(`\n[${run.status}]`);
          controller.close();
        })
        .catch(() => controller.close());
    },
    cancel() {
      push = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Run-Id": started.run.id,
    },
  });
}
