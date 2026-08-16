"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "@/components/Ramp";
import { useMic, useSpeaker } from "@/components/useSpeech";
import { detectNavigation, type NavClient } from "@/lib/ask/navigate";

/**
 * The virtual system: what "Stride" opens.
 *
 * Not the /ask page — a takeover that appears over whatever the founder was
 * looking at, listens for the real question the moment it opens (voice
 * triggered it, so voice continues; no button to press), and answers from
 * the same whole-console brain /ask itself reads from. Never scoped to one
 * client — that is what makes this "the whole brain," matching what was
 * asked for.
 *
 * Owns the microphone exclusively while open. VoiceAmbient does not run its
 * own wake-word loop while this is mounted-and-open, so there is only ever
 * one MediaRecorder fighting for the input device at a time.
 */

const LISTEN_MS = 6_500;

type Phase = "listening" | "thinking" | "answering" | "done";

export function VoiceOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [clients, setClients] = useState<NavClient[]>([]);
  const router = useRouter();
  const speaker = useSpeaker();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleClose(afterMs: number) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(onClose, afterMs);
  }

  async function answerFrom(text: string) {
    const asked = text.trim();
    if (!asked) {
      setProblem("Nothing was heard.");
      scheduleClose(2_200);
      return;
    }
    setQuestion(asked);

    const nav = detectNavigation(asked, clients);
    if (nav) {
      const line = `Opening ${nav.label}.`;
      setAnswer(line);
      setPhase("answering");
      speaker.flush(line);
      router.push(nav.href);
      scheduleClose(1_600);
      return;
    }

    setPhase("thinking");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setProblem(err.error ?? "The model did not answer.");
        scheduleClose(2_600);
        return;
      }
      setPhase("answering");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
        const soFar = chunks.join("");
        setAnswer(soFar);
        speaker.feed(soFar);
      }
      const full = chunks.join("");
      speaker.flush(full);
      setPhase("done");
      scheduleClose(1_400 + full.length * 28);
    } catch {
      setProblem("The connection to the model dropped.");
      scheduleClose(2_600);
    }
  }

  const mic = useMic((text) => {
    void answerFrom(text);
  });
  // Same pattern useMic itself uses for its own onTranscript callback: held
  // in a ref, synced after render rather than during it, so the effect below
  // can call mic.start()/stop() without needing `mic` in its dependency
  // array (a fresh mic object every render would otherwise restart the
  // recording on every keystroke of the streamed answer).
  const micRef = useRef(mic);
  useEffect(() => {
    micRef.current = mic;
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data: Array<{ id: string; name: string; company?: string }>) => {
        if (cancelled || !Array.isArray(data)) return;
        setClients(data.map((c) => ({ id: c.id, label: c.company || c.name })));
      })
      .catch(() => {
        /* voice navigation to a client just will not fire; asking still works */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // The whole point of a voice trigger is that nothing needs a tap: opening
  // starts the real recording immediately, and a fixed window closes it —
  // there is no silence detector here, just "Stride" implying "ask your
  // question now" the way a person would actually use it.
  useEffect(() => {
    if (!open) return;
    // Resetting local state right alongside starting the real MediaRecorder
    // is exactly React's own documented exception to "avoid setState in an
    // effect" — synchronizing with an external system (the microphone) that
    // this same effect is about to start talking to. There is no prop this
    // state could be derived from instead; "listening" only ever comes from
    // opening having just happened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("listening");
    setQuestion("");
    setAnswer("");
    setProblem(null);
    micRef.current.start();
    listenTimer.current = setTimeout(() => micRef.current.stop(), LISTEN_MS);
    return () => {
      if (listenTimer.current) clearTimeout(listenTimer.current);
      micRef.current.stop();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      speaker.stop();
      if (closeTimer.current) clearTimeout(closeTimer.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Derived at render, not copied into state via an effect: mic.problem
  // already IS state (useMic's own), and shadowing it into a second piece
  // of state that exists just to mirror the first is the redundant-effect
  // pattern this file's other two effects are the legitimate exception to.
  const shownProblem = problem || mic.problem;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask Stride, by voice"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card-glass mx-4 w-full max-w-md rounded-card border border-line bg-white p-7 text-center shadow-[0_24px_64px_-24px_rgba(10,12,20,0.45)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pressable float-right -mr-2 -mt-2 rounded-full p-1.5 text-mute hover:text-ink"
        >
          ✕
        </button>

        <span className={`inline-flex text-indigo ${phase !== "done" ? "hub-mark-alive" : ""}`}>
          <Mark size={40} />
        </span>

        <p className="eyebrow mt-4 text-slate">
          {phase === "listening" && "Listening"}
          {phase === "thinking" && "Thinking"}
          {(phase === "answering" || phase === "done") && "Ask Stride"}
        </p>

        {question && (
          <p className="mt-3 text-[15px] font-semibold leading-snug text-ink">
            &ldquo;{question}&rdquo;
          </p>
        )}

        {shownProblem && <p className="mt-3 text-[14px] leading-snug text-amber">{shownProblem}</p>}

        {answer && !shownProblem && (
          <p className="mt-3 whitespace-pre-line text-left text-[14px] leading-relaxed text-ink">
            {answer}
          </p>
        )}

        {phase === "listening" && !question && (
          <p className="mt-3 text-[13px] text-slate">Ask anything about the console.</p>
        )}
      </div>
    </div>
  );
}
