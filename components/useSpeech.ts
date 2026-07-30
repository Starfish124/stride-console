"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { splitSpeakable } from "@/lib/speech/kokoro";

/**
 * Talking to the console, and it talking back.
 *
 * Both directions run on this Mac: whisper.cpp behind /api/speech/hear, Kokoro
 * behind /api/speech/say. Nothing is sent to Apple or Google, which is the
 * difference between the browser's own speech API and this, and the reason the
 * extra work is worth it.
 *
 * ⚠️ getUserMedia needs a secure context. The Funnel address is HTTPS and
 * localhost counts, so both surfaces work — but a plain http:// LAN address
 * will not, and the failure is a permission error rather than a missing API.
 */

/** Hold to talk. Releases into a transcript, or into nothing if it heard nothing. */
export function useMic(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // The callback is held in a ref so starting a recording does not capture a
  // stale closure over the caller's state. Synced in an effect rather than
  // during render, which react-hooks/refs rightly rejects.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    setProblem(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setProblem("This browser cannot record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem("The microphone was not allowed.");
      return;
    }

    // Container is the browser's choice: Safari records mp4, Chrome webm/opus.
    // ffmpeg works it out on the other end, so nothing is forced here.
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      // Release the mic straight away — on iOS the recording indicator stays
      // lit until every track is stopped, which reads as "it is still listening".
      stream.getTracks().forEach((t) => t.stop());
      setThinking(true);
      try {
        const res = await fetch("/api/speech/hear", {
          method: "POST",
          body: new Blob(chunks),
        });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok) setProblem(data.error ?? "That recording could not be read.");
        else if (!data.text) setProblem("Nothing was said.");
        else onTranscriptRef.current(data.text);
      } catch {
        setProblem("The recording did not reach the console.");
      } finally {
        setThinking(false);
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }, []);

  useEffect(() => () => recorderRef.current?.stop(), []);

  return { recording, thinking, problem, start, stop };
}

/**
 * Speak an answer as it arrives, a sentence at a time.
 *
 * Kokoro renders a whole utterance before returning its first byte — about two
 * seconds for a sentence — so waiting for the model to finish and then speaking
 * the lot is a long silence followed by a speech. Instead each finished
 * sentence is rendered while the next one is still being written, and played in
 * order.
 */
export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  /** How much of the current answer has already been handed to the voice. */
  const spokenRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped on stop, so audio already in flight knows it is no longer wanted.
  const runRef = useRef(0);

  const play = useCallback(async (sentence: string, run: number) => {
    const res = await fetch("/api/speech/say", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sentence }),
    });
    if (!res.ok || run !== runRef.current) return;
    const url = URL.createObjectURL(await res.blob());
    try {
      await new Promise<void>((resolve) => {
        if (run !== runRef.current) return resolve();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        // A failed play must not wedge the queue behind it.
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  /** Feed the answer as it streams. Complete sentences are spoken, the tail waits. */
  const feed = useCallback(
    (fullAnswerSoFar: string) => {
      const unspoken = fullAnswerSoFar.slice(spokenRef.current);
      const { ready, rest } = splitSpeakable(unspoken);
      if (ready.length === 0) return;
      spokenRef.current += unspoken.length - rest.length;
      const run = runRef.current;
      setSpeaking(true);
      for (const sentence of ready) {
        queueRef.current = queueRef.current.then(() => play(sentence, run));
      }
      queueRef.current = queueRef.current.then(() => {
        if (run === runRef.current) setSpeaking(false);
      });
    },
    [play],
  );

  /** Say whatever is left, including a final sentence with no trailing space. */
  const flush = useCallback(
    (fullAnswer: string) => {
      const tail = fullAnswer.slice(spokenRef.current).trim();
      spokenRef.current = fullAnswer.length;
      if (!tail) return;
      const run = runRef.current;
      setSpeaking(true);
      queueRef.current = queueRef.current
        .then(() => play(tail, run))
        .then(() => {
          if (run === runRef.current) setSpeaking(false);
        });
    },
    [play],
  );

  /**
   * Cut the voice off and forget the answer it was reading.
   *
   * Also how a new question starts: bumping the run number is what stops a
   * sentence that is already rendering from playing over the next answer.
   */
  const stop = useCallback(() => {
    runRef.current += 1;
    spokenRef.current = 0;
    queueRef.current = Promise.resolve();
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  useEffect(() => () => audioRef.current?.pause(), []);

  return { speaking, feed, flush, stop };
}
