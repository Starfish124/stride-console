"use client";

import { useEffect, useRef, useState } from "react";

// The room's recorder. iOS Safari cannot hand out a decodable mid-stream
// chunk, so this records in ~20s standalone takes: stop, upload, immediately
// start the next. Each take is transcribed on the Mac (whisper, Dutch) and
// the transcript grows here and on the other phone. A wake lock keeps the
// screen — and with it the recorder — alive; iOS still kills it if the tab
// is backgrounded, which the banner says out loud.

const SEGMENT_MS = 20_000;

export function DuraboRecorder({
  slug,
  transcript,
  onTranscript,
}: {
  slug: string;
  transcript: string;
  /** Fresher text straight from an upload, for the parent's copy. */
  onTranscript: (t: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [insight, setInsight] = useState("");
  const [insightBusy, setInsightBusy] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(false);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => () => stop(), []);

  // Sortable across a stopped-and-resumed recording: seconds since midnight.
  function seq(): number {
    const d = new Date();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  }

  async function upload(blob: Blob) {
    setPending((p) => p + 1);
    try {
      const res = await fetch(`/api/durabo/audio?slug=${encodeURIComponent(slug)}&seq=${seq()}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.transcript === "string") onTranscript(data.transcript);
        setSegments((n) => n + 1);
        setError("");
      } else {
        setError("Segment niet verwerkt — opname loopt door, transcript mist een stuk.");
      }
    } catch {
      setError("Upload haperde — opname loopt door, transcript mist een stuk.");
    } finally {
      setPending((p) => p - 1);
    }
  }

  function take(stream: MediaStream) {
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      if (chunks.length > 0) void upload(new Blob(chunks, { type: rec.mimeType }));
      if (liveRef.current) take(stream);
    };
    recRef.current = rec;
    rec.start();
    timerRef.current = setTimeout(() => rec.state === "recording" && rec.stop(), SEGMENT_MS);
  }

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      liveRef.current = true;
      setRecording(true);
      take(stream);
      type WakeNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      wakeRef.current = (await (navigator as WakeNav).wakeLock?.request("screen").catch(() => null)) ?? null;
    } catch {
      setError("Geen toegang tot de microfoon. Sta het toe in de browserinstellingen.");
    }
  }

  function stop() {
    liveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    setRecording(false);
  }

  async function finish() {
    stop();
    await fetch(`/api/durabo/audio?slug=${encodeURIComponent(slug)}&action=finish`, { method: "POST" }).catch(
      () => {},
    );
  }

  async function askInsight() {
    setInsightBusy(true);
    setInsight("");
    try {
      const res = await fetch("/api/durabo/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      setInsight(res.ok ? data.suggestions : data.error ?? "Geen antwoord.");
    } catch {
      setInsight("Geen antwoord van het model.");
    } finally {
      setInsightBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            className="pressable rounded-full bg-indigo px-4 py-2 text-sm font-medium text-white"
            onClick={() => void start()}
          >
            ● Start opname
          </button>
        ) : (
          <button
            className="pressable rounded-full border border-line px-4 py-2 text-sm font-medium text-amber"
            onClick={() => void finish()}
          >
            ■ Stop opname
          </button>
        )}
        <span className="text-xs text-slate">
          {recording ? "Neemt op — scherm aan laten, tab open houden." : "Audio blijft op de Mac."}
          {segments > 0 ? ` · ${segments} segmenten` : ""}
          {pending > 0 ? " · verwerken…" : ""}
        </span>
      </div>
      {recording && (
        <p className="rounded-card border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          Telefoon niet vergrendelen en deze tab niet wegdrukken — iOS stopt anders de microfoon.
        </p>
      )}
      {error && <p className="text-xs text-amber">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          className="pressable rounded-full border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          disabled={insightBusy}
          onClick={() => void askInsight()}
        >
          {insightBusy ? "Denkt na…" : "Wat missen we?"}
        </button>
        <span className="text-xs text-slate">Lokaal model, leest transcript + open punten.</span>
      </div>
      {insight && (
        <pre className="whitespace-pre-wrap rounded-card border border-indigo/30 bg-indigo-tint/40 px-3 py-2 font-sans text-sm text-ink">
          {insight}
        </pre>
      )}

      {transcript ? (
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{transcript}</pre>
      ) : (
        <p className="text-sm text-slate">
          Nog geen transcript. Start de opname; elke ~20 seconden verschijnen de woorden hier en op de
          andere telefoon.
        </p>
      )}
    </div>
  );
}
