"use client";

import { useEffect, useState } from "react";
import { IconEscalate } from "@/components/icons";

/**
 * The WhatsApp bridge, on the settings page.
 *
 * Three states, one panel: no bridge running at all, waiting on a QR scan
 * (the image itself, polled until it either lands or a founder rescans),
 * and paired — where the useful fact is when it last heard from someone,
 * because a bridge that has gone quiet for a week is a founder problem, not
 * a WhatsApp problem.
 */

interface Status {
  paired?: boolean;
  waitingForQr?: boolean;
  qrAt?: string;
  connectedAt?: string;
  founders: string[];
  messageCount: number;
  lastInboundAt: string | null;
}

function since(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WhatsAppPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qrBust, setQrBust] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch("/api/whatsapp/status", { cache: "no-store" })
        .then((r) => r.json())
        .then((data: Status) => {
          if (cancelled) return;
          setStatus(data);
          if (data.waitingForQr) setQrBust((n) => n + 1);
        })
        .catch(() => {
          /* the route itself never errors; a network hiccup just waits for the next tick */
        });
    };
    poll();
    // Fast while there is something to watch for, slow once settled — no
    // reason to hit disk five times a second for a number that will not
    // move until someone actually messages the bridge.
    const id = setInterval(poll, status?.waitingForQr ? 2_500 : 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status?.waitingForQr]);

  return (
    <section id="whatsapp" className="mb-10 card-glass rounded-card border border-line bg-white p-6">
      <p className="eyebrow flex items-center gap-2 text-slate">
        <IconEscalate size={15} className="text-indigo" />
        WhatsApp
      </p>
      <p className="mt-2 text-sm text-slate">
        A bridge to the StrideAI WhatsApp group: draft-ready pings land there, and messages
        opening with &quot;Stride,&quot; reach the same brain as Ask Stride.
      </p>

      {status === null && <p className="mt-4 text-sm text-slate">Reading the bridge…</p>}

      {status && !status.paired && !status.waitingForQr && (
        <p className="mt-4 text-sm text-slate">
          No bridge running.{" "}
          <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[12px]">
            npm run whatsapp
          </code>{" "}
          starts it.
        </p>
      )}

      {status?.waitingForQr && (
        <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local, no-store bridge image; next/image's remote optimiser has nothing to do here */}
          <img
            src={`/api/whatsapp/qr?t=${qrBust}`}
            alt="Scan with WhatsApp: Settings, Linked Devices, Link a Device"
            width={180}
            height={180}
            className="rounded-input border border-line"
          />
          <p className="text-sm text-slate">
            Open WhatsApp on the paired phone → Settings → Linked Devices → Link a Device, and
            scan this. It refreshes itself if it expires.
          </p>
        </div>
      )}

      {status?.paired && (
        <dl className="mt-4 flex flex-col gap-1.5">
          <div className="flex gap-2 text-[13px]">
            <dt className="text-slate">Status</dt>
            <dd className="tabular font-medium text-ink">
              Connected{status.connectedAt ? ` · ${since(status.connectedAt)}` : ""}
            </dd>
          </div>
          <div className="flex gap-2 text-[13px]">
            <dt className="text-slate">Last message in</dt>
            <dd className="tabular text-ink">{since(status.lastInboundAt)}</dd>
          </div>
          <div className="flex gap-2 text-[13px]">
            <dt className="text-slate">Messages on file</dt>
            <dd className="tabular text-ink">{status.messageCount}</dd>
          </div>
          <div className="flex gap-2 text-[13px]">
            <dt className="text-slate">Who it answers</dt>
            <dd className="tabular text-ink">
              {status.founders.length > 0 ? status.founders.join(", ") : "nobody yet — set STRIDE_WHATSAPP_FOUNDERS"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
