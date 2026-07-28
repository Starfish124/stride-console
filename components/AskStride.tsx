"use client";

import { useEffect, useRef, useState } from "react";
import { IconAskStride, IconConfidence, IconLineageDoc } from "@/components/icons";
import { Loader } from "@/components/Loader";

/**
 * A local model that can only answer from what the console actually knows.
 *
 * The fact sheet it was given is one tap away under every answer. That is not
 * a debugging affordance — the model is small enough to get things wrong, and
 * an answer you cannot check against the source is worse than no answer when
 * the subject is your own pipeline.
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What needs me today?",
  "Where is the pipeline at?",
  "Is anything late?",
  "What is the LinkedIn machine doing?",
  "What is on the board to build?",
];

export function AskStride() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [facts, setFacts] = useState<{ text: string; model: string } | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch-on-mount, same shape the radar and SEO views use.
    let cancelled = false;
    fetch("/api/ask")
      .then((r) => r.json())
      .then((data: { text: string; model: string; ok: boolean; problem?: string }) => {
        if (cancelled) return;
        setFacts({ text: data.text, model: data.model });
        if (!data.ok) setProblem(data.problem ?? null);
      })
      .catch(() => {
        if (!cancelled) setProblem("Could not read the console's own state.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function ask(text: string) {
    const asked = text.trim();
    if (!asked || streaming) return;
    setProblem(null);
    setQuestion("");
    const history = turns.slice(-4);
    setTurns((t) => [...t, { role: "user", content: asked }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked, history }),
      });

      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setProblem(err.error ?? "The model did not answer.");
        // Drop the empty assistant turn rather than leave a blank bubble.
        setTurns((t) => t.slice(0, -1));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Chunks are collected and joined per tick rather than appended to a
      // running string: the closure handed to setTurns must close over a value
      // that cannot change under it, which a reassigned let cannot promise.
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
        const answer = chunks.join("");
        setTurns((t) => [...t.slice(0, -1), { role: "assistant", content: answer }]);
      }
    } catch {
      setProblem("The connection to the model dropped.");
      setTurns((t) => t.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div>
      {problem && (
        <p className="mb-6 flex items-start gap-2.5 rounded-card border border-amber/40 bg-amber/[0.06] px-5 py-4 text-[15px] leading-snug text-ink">
          <IconConfidence size={18} className="mt-0.5 shrink-0 text-amber" />
          {problem}
        </p>
      )}

      {turns.length === 0 ? (
        <div className="mb-8">
          <p className="eyebrow mb-3 text-slate">Try one of these</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="pressable rounded-full border border-line bg-white px-3.5 py-2 text-[14px] text-slate hover:border-indigo/30 hover:text-indigo"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="mb-8 flex flex-col gap-4">
          {turns.map((t, i) => (
            <li
              key={i}
              className={t.role === "user" ? "flex justify-end" : "flex items-start gap-3"}
            >
              {t.role === "assistant" && (
                <IconAskStride size={20} className="mt-1.5 shrink-0 text-indigo" />
              )}
              <div
                className={
                  t.role === "user"
                    ? "max-w-[80%] rounded-card rounded-br-sm bg-ink px-4 py-2.5 text-[15px] leading-snug text-white"
                    : "card-glass max-w-[85%] rounded-card rounded-bl-sm border border-line bg-white px-4 py-3 text-[15px] leading-relaxed text-ink"
                }
              >
                {t.content ? (
                  <p className="whitespace-pre-line">{t.content}</p>
                ) : (
                  <Loader size={20} />
                )}
              </div>
            </li>
          ))}
          <div ref={endRef} />
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] flex gap-2 sm:bottom-6"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about the console"
          disabled={streaming}
          className="material flex-1 rounded-input border border-line px-4 py-3 text-[15px] text-ink outline-none placeholder:text-slate/60 focus:border-indigo disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={streaming || !question.trim()}
          className="rounded-input border border-ink bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-midnight disabled:opacity-40"
        >
          {streaming ? "Thinking." : "Ask."}
        </button>
      </form>

      {facts && (
        <section className="mt-10">
          <button
            type="button"
            onClick={() => setShowFacts((v) => !v)}
            className="flex items-center gap-2 text-[13px] font-semibold text-slate hover:text-indigo"
          >
            <IconLineageDoc size={16} className="shrink-0" />
            {showFacts ? "Hide" : "Show"} everything it was told
            <span className="eyebrow text-mute">{facts.model}</span>
          </button>
          {showFacts && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-card border border-line bg-white p-5 font-mono text-[12px] leading-relaxed text-slate">
              {facts.text}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
