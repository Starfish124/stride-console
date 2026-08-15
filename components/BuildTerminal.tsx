"use client";

// The building area's terminal: xterm.js over the /term relay into a tmux
// session on this Mac. Binary frames are the byte stream, text frames are
// control JSON; the one control message the server ever sends is
// {"evicted":true} when a newer client claims the session — the correct
// response is to stand down, not to reconnect and fight for the PTY.

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const KEYS: { label: string; seq: string }[] = [
  { label: "esc", seq: "\x1b" },
  { label: "tab", seq: "\t" },
  { label: "^C", seq: "\x03" },
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
  { label: "←", seq: "\x1b[D" },
  { label: "→", seq: "\x1b[C" },
];

export default function BuildTerminal({
  cwd,
  preset,
  mode,
}: {
  cwd: string;
  preset: string;
  mode?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ctrlArmed = useRef(false);
  const [ctrl, setCtrl] = useState(false);
  const [status, setStatus] = useState<"connecting" | "live" | "evicted" | "down">("connecting");

  useEffect(() => {
    if (!holder.current) return;
    let gone = false;
    let evicted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      scrollback: 2000,
      theme: { background: "#101322" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(holder.current);
    fit.fit();
    termRef.current = term;

    const sendResize = () => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ resize: { rows: term.rows, cols: term.cols } }));
      }
    };

    const connect = () => {
      if (gone || evicted) return;
      const q = new URLSearchParams({ cwd, preset, rows: String(term.rows), cols: String(term.cols) });
      if (mode) q.set("mode", mode);
      const url =
        location.protocol === "https:"
          ? `wss://${location.host}/term/pty?${q}`
          : `ws://${location.hostname}:7457/pty?${q}`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("live");
        sendResize();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          try {
            if (JSON.parse(ev.data).evicted === true) {
              evicted = true;
              setStatus("evicted");
              term.write("\r\n\x1b[33m— session taken over elsewhere —\x1b[0m\r\n");
            }
          } catch {
            // Not control JSON; ignore rather than print it into the stream.
          }
          return;
        }
        term.write(new Uint8Array(ev.data as ArrayBuffer));
      };
      ws.onclose = () => {
        if (gone || evicted) return;
        setStatus("down");
        reconnectTimer = setTimeout(connect, 1500);
      };
    };

    term.onData((d) => {
      const ws = wsRef.current;
      if (ws?.readyState !== WebSocket.OPEN) return;
      let out = d;
      if (ctrlArmed.current && d.length === 1) {
        out = String.fromCharCode(d.charCodeAt(0) & 0x1f);
        ctrlArmed.current = false;
        setCtrl(false);
      }
      ws.send(new TextEncoder().encode(out));
    });

    const refit = () => {
      fit.fit();
      sendResize();
    };
    const ro = new ResizeObserver(refit);
    ro.observe(holder.current);
    // iOS: the keyboard shrinks the visual viewport without a window resize.
    window.visualViewport?.addEventListener("resize", refit);
    // Browsers cannot send WS pings; an idempotent resize keeps the funnel's
    // proxies from cutting a quiet session.
    keepaliveTimer = setInterval(sendResize, 30_000);

    connect();
    term.focus();

    return () => {
      gone = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", refit);
      wsRef.current?.close();
      term.dispose();
    };
  }, [cwd, preset, mode]);

  const press = (seq: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(seq));
    termRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={holder} className="min-h-0 flex-1 overflow-hidden rounded-lg bg-[#101322] p-2" />
      <div className="flex items-center gap-1.5 overflow-x-auto py-2">
        <span
          className={`size-2 shrink-0 rounded-full ${
            status === "live" ? "bg-lime" : status === "connecting" ? "bg-amber" : "bg-mute/50"
          }`}
          title={status}
        />
        <button
          type="button"
          onPointerDown={(e) => {
            // preventDefault so xterm's hidden textarea keeps focus — without
            // it iOS closes the keyboard on every toolbar tap.
            e.preventDefault();
            ctrlArmed.current = !ctrlArmed.current;
            setCtrl(ctrlArmed.current);
            termRef.current?.focus();
          }}
          className={`rounded-md px-3 py-1.5 font-mono text-xs ${
            ctrl ? "bg-indigo text-white" : "bg-ink/5 dark:bg-white/10"
          }`}
        >
          ctrl
        </button>
        {KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              press(k.seq);
            }}
            className="rounded-md bg-ink/5 px-3 py-1.5 font-mono text-xs dark:bg-white/10"
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
