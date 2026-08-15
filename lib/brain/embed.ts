// Embeddings from the Ollama already on this Mac. No SDK, one POST — the
// same posture as lib/ask/ollama.ts, and the same rule: everything local.
//
// Never throws. No Ollama, no model, a timeout — all of that returns null,
// and every caller degrades to FTS-only search, which is exactly what the
// console did before embeddings existed. Memory being down must never take
// search down with it.

const HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

/**
 * nomic-embed-text: 274MB resident, 768 dims, the standing local default.
 * Small enough to live beside qwen3:8b on a 16GB Mac without an eviction war.
 */
export const EMBED_MODEL = process.env.STRIDE_EMBED_MODEL ?? "nomic-embed-text";

const TIMEOUT_MS = 20_000;

/** Embed a batch of texts. null = the semantic layer is unavailable right now. */
export async function embedTexts(texts: string[]): Promise<Float32Array[] | null> {
  if (texts.length === 0) return [];
  try {
    const res = await fetch(`${HOST}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) return null;
    return data.embeddings.map((e) => Float32Array.from(e));
  } catch {
    return null;
  }
}

/** One query vector, or null when the layer is down. */
export async function embedQuery(text: string): Promise<Float32Array | null> {
  const out = await embedTexts([text]);
  return out?.[0] ?? null;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
