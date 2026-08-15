import { NextResponse } from "next/server";
import { buildContext, SYSTEM_PROMPT } from "@/lib/ask/context";
import { ASK_MODEL, modelReady, streamChat, type AskMessage } from "@/lib/ask/ollama";

export const dynamic = "force-dynamic";

/** The fact sheet on its own, so the page can show what the model was given. */
export async function GET() {
  const [context, ready] = await Promise.all([buildContext(), modelReady()]);
  return NextResponse.json({ ...context, model: ASK_MODEL, ...ready });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    history?: AskMessage[];
  };
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Ask something." }, { status: 400 });
  }

  const ready = await modelReady();
  if (!ready.ok) {
    return NextResponse.json({ error: ready.problem }, { status: 503 });
  }

  const context = await buildContext(question);

  // The sheet rides on the last user turn rather than the system prompt: a
  // small model weights what it just read far more heavily than what it was
  // told at the top, and the sheet is the part that must not be ignored.
  const messages: AskMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    // Only the last few turns. This model's context is small, and the sheet
    // has to fit in it whole or the grounding is the thing that gets cut.
    ...(body.history ?? []).slice(-4),
    {
      role: "user",
      content: `Notes on the console as it stands right now:\n\n${context.text}\n\n---\n\nQuestion: ${question}`,
    },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "The model stopped.";
        controller.enqueue(encoder.encode(`\n\n[${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // The console sits behind a Tailscale Funnel, which will happily buffer
      // a stream into one lump and undo the point of streaming it.
      "X-Accel-Buffering": "no",
    },
  });
}
