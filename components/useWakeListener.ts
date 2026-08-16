"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The background ear: record in short chunks, forever, and ask whisper.cpp
 * whether any of them said "Stride" — no cloud speech API, same rule
 * useSpeech.ts already holds for every other voice path in this console.
 *
 * That is the deliberate cost of staying local: no lightweight native wake
 * word detector, so every chunk is a real whisper-cli spawn (~0.5s on this
 * Mac per the timing note in lib/speech/whisper.ts) whether or not anyone
 * said anything. Three-second chunks keep the loop from ever backing up
 * behind itself and keep the delay between saying "Stride" and the console
 * noticing to a few seconds, not longer.
 *
 * `enabled` is a prop, not a call to start/stop, because two different
 * callers need to turn this off for two different reasons: the founder's
 * own preference (Settings, off by default), and VoiceOverlay owning the
 * microphone exclusively while it is actively taking the real question —
 * running both loops at once would mean two MediaRecorders fighting over
 * one input device for no reason.
 */
const CHUNK_MS = 3000;
const WAKE_WORD = /\bstride\b/i;

export function useWakeListener(enabled: boolean, onWake: () => void) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  });

  const recordChunk = useCallback((stream: MediaStream): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks));
      recorder.start();
      setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, CHUNK_MS);
    });
  }, []);

  useEffect(() => {
    // No explicit setListening(false) here: state already starts false, and
    // a true→false transition already runs through this same effect's own
    // cleanup below, which sets it false there. Setting it again on top
    // would just be a redundant synchronous render this rule is right to
    // flag.
    if (!enabled) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      // A capability check against the browser itself, not derivable from
      // any prop or prior state — the same external-system exception as
      // the getUserMedia rejection path below, just resolved synchronously
      // instead of after an await.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProblem("This browser cannot record audio.");
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) setProblem("The microphone was not allowed.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setProblem(null);
      setListening(true);

      // The loop condition is `cancelled`, checked after every await, so
      // the effect's own cleanup (enabled flips off, route changes, or the
      // component unmounts) stops the next chunk from ever starting rather
      // than needing a separate stop flag threaded through the closure.
      while (!cancelled && stream) {
        const blob = await recordChunk(stream);
        if (cancelled) break;
        try {
          const res = await fetch("/api/speech/hear", { method: "POST", body: blob });
          if (!res.ok) continue;
          const data = (await res.json()) as { text?: string };
          if (data.text && WAKE_WORD.test(data.text)) onWakeRef.current();
        } catch {
          // One chunk failing to transcribe is not worth surfacing — a
          // network hiccup every three seconds would be worse than the
          // silent retry on the next chunk.
        }
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setListening(false);
    };
  }, [enabled, recordChunk]);

  return { listening, problem };
}
