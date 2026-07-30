// The local model, over Ollama's HTTP API.
//
// No SDK: this is one POST and a stream of newline-delimited JSON, and a
// dependency to spell that is a dependency to keep. Everything stays on this
// Mac, which is the point — the fact sheet has the whole client book in it.

/**
 * The smallest model that actually answers the question.
 *
 * Measured on this Mac against the real fact sheet, asking "what needs me
 * today": qwen2.5:0.5b reprints the sheet and then loops, 1.5b answers but
 * picks a minor item over the overdue one, 3b names the right thing. 3b is
 * 1.9GB and replies in a few seconds, so the two sizes below it save nothing
 * worth having. Set STRIDE_ASK_MODEL to override.
 */
export const ASK_MODEL = process.env.STRIDE_ASK_MODEL ?? "qwen2.5:3b";

const HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

export interface AskMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Is Ollama up, and is the model actually pulled? */
export async function modelReady(): Promise<{ ok: boolean; problem?: string }> {
  try {
    const res = await fetch(`${HOST}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { ok: false, problem: "Ollama answered, but not with its model list." };
    const body = (await res.json()) as { models?: { name: string }[] };
    const names = (body.models ?? []).map((m) => m.name);
    // Ollama reports "qwen2.5:0.5b"; a bare "qwen2.5" in the env should still
    // match rather than read as missing.
    if (!names.some((n) => n === ASK_MODEL || n.startsWith(`${ASK_MODEL}:`))) {
      return { ok: false, problem: `Ollama is running but ${ASK_MODEL} is not pulled. Run: ollama pull ${ASK_MODEL}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, problem: "Ollama is not running on this Mac. Start it and ask again." };
  }
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  numCtx?: number;
  /** Ollama's own JSON mode. Set it and the model cannot answer in prose. */
  format?: "json";
  signal?: AbortSignal;
}

/**
 * One question, one answer, no stream.
 *
 * Classification wants a whole string before it can do anything, so streaming
 * it is a generator to assemble for nothing. Same host, same model list.
 */
export async function chat(messages: AskMessage[], options: ChatOptions = {}): Promise<string> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal ?? AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: options.model ?? ASK_MODEL,
      messages,
      stream: false,
      format: options.format,
      options: { temperature: options.temperature ?? 0.2, num_ctx: options.numCtx ?? 8192 },
    }),
  });
  if (!res.ok) throw new Error(`The model answered with ${res.status}.`);
  const body = (await res.json()) as { message?: { content?: string }; error?: string };
  if (body.error) throw new Error(body.error);
  return body.message?.content ?? "";
}

/**
 * Stream an answer as plain text chunks.
 *
 * Ollama streams one JSON object per line. A chunk off the network can split
 * mid-line, so the tail is carried forward rather than parsed and dropped —
 * without that, long answers lose a word every few hundred characters.
 */
export async function* streamChat(
  messages: AskMessage[],
  options: ChatOptions = {},
): AsyncGenerator<string> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Without this a wedged model held the request open until the browser
    // gave up, which looks to a founder exactly like a hung console.
    signal: options.signal ?? AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: options.model ?? ASK_MODEL,
      messages,
      stream: true,
      format: options.format,
      options: {
        // Low temperature: this is a lookup over a fact sheet, not writing.
        temperature: options.temperature ?? 0.2,
        num_ctx: options.numCtx ?? 8192,
      },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`The model answered with ${res.status}.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          message?: { content?: string };
          error?: string;
        };
        if (parsed.error) throw new Error(parsed.error);
        const chunk = parsed.message?.content;
        if (chunk) yield chunk;
      } catch (err) {
        // A half-line is expected and carried; a real error is not.
        if (err instanceof Error && !(err instanceof SyntaxError)) throw err;
      }
    }
  }
}
