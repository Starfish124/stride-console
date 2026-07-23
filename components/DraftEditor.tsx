"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RECIPE_LABELS,
  type Destination,
  type Draft,
  type LintResult,
  type PostLogEntry,
} from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { StatsForm } from "@/components/StatsForm";

const TABS: { id: Destination; label: string }[] = [
  { id: "page", label: "Company page" },
  { id: "founderA", label: "Founder A" },
  { id: "founderB", label: "Founder B" },
];

const LINKEDIN_SHARE = "https://www.linkedin.com/feed/?shareActive=true";

function CharCounter({ text }: { text: string }) {
  const len = text.length;
  const firstLine = (text.split("\n")[0] ?? "").length;
  const inBand = len >= 1200 && len <= 2000;
  const hardFail = len < 900 || len > 2900;
  const pct = Math.min(100, (len / 2900) * 100);
  return (
    <div className="mt-2">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-line">
        {/* target band 1,200-2,000 of the 2,900 scale */}
        <div
          className="absolute inset-y-0 bg-indigo-tint"
          style={{ left: `${(1200 / 2900) * 100}%`, width: `${(800 / 2900) * 100}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 ${hardFail ? "bg-slate" : inBand ? "bg-indigo" : "bg-slate"}`}
          style={{ width: `${pct}%`, opacity: 0.9 }}
        />
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="eyebrow text-slate">
          {len.toLocaleString("en-US")} chars — target 1,200-2,000
        </span>
        <span className={`eyebrow ${firstLine > 140 ? "text-indigo-deep" : "text-slate"}`}>
          Fold {firstLine}/140
        </span>
      </div>
    </div>
  );
}

function LintPanel({ result }: { result: LintResult }) {
  if (result.violations.length === 0) {
    return (
      <div className="rounded-card border border-line bg-white p-5">
        <p className="eyebrow text-indigo">Voice gate — clear</p>
        <p className="mt-2 text-sm text-slate">
          Zero violations. This variant reads like Stride.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-line bg-white p-5">
      <p className="eyebrow text-slate">
        Voice gate — {result.errors} blocking, {result.warns} amber
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {result.violations.map((v, i) => (
          <li key={i} className="text-sm">
            <span
              className={`eyebrow mr-2 rounded-full border px-2 py-0.5 ${
                v.severity === "error"
                  ? "border-indigo bg-indigo-tint text-indigo"
                  : "border-line bg-paper text-slate"
              }`}
            >
              {v.rule}
            </span>
            <span className="text-ink">{v.excerpt}</span>
            {v.fix ? <span className="text-slate"> — {v.fix}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DraftEditor({
  initial,
  postLog = [],
}: {
  initial: Draft;
  postLog?: PostLogEntry[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [tab, setTab] = useState<Destination>("page");
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  const text = draft.variants[tab];
  const lintResult = draft.lint[tab];
  const blocking = useMemo(
    () => Object.values(draft.lint).reduce((n, r) => n + r.errors, 0),
    [draft.lint],
  );

  async function call(path: string, body?: unknown): Promise<Draft | undefined> {
    setBusy(path);
    setNotice(undefined);
    try {
      const res = await fetch(path, {
        method: body === null ? "POST" : body ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: body && body !== null ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice((data as { error?: string }).error ?? "That failed.");
        return undefined;
      }
      return data as Draft;
    } finally {
      setBusy(undefined);
    }
  }

  function updateText(value: string) {
    setDraft({ ...draft, variants: { ...draft.variants, [tab]: value } });
  }

  async function saveText() {
    const updated = await call(`/api/drafts/${draft.id}`, {
      destination: tab,
      text,
    });
    if (updated) setDraft(updated);
  }

  async function regenerate() {
    const updated = await call(`/api/drafts/${draft.id}/regenerate`, null);
    if (updated) setDraft(updated);
  }

  async function approve() {
    const updated = await call(`/api/drafts/${draft.id}/approve`, null);
    if (updated) {
      setDraft(updated);
      router.refresh();
    }
  }

  async function markPosted() {
    const res = await fetch(`/api/drafts/${draft.id}/posted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: tab }),
    });
    if (res.ok) {
      setDraft((await res.json()) as Draft);
      router.refresh();
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const postedHere = draft.posted.some((p) => p.destination === tab);
  const renderBase = `/api/renders/${draft.id}`;
  const isCarousel = draft.recipe === "myth";

  return (
    <div className="pb-28 pt-10 lg:pb-0">
      <div className="flex flex-wrap items-center gap-4">
        <p className="eyebrow text-slate">
          {RECIPE_LABELS[draft.recipe]} — week {draft.weekNumber}
        </p>
        <StatusBadge status={draft.status} />
        {draft.needsPolish ? (
          <span className="eyebrow rounded-full border border-line bg-white px-3 py-1 text-slate">
            Template draft — needs polish
          </span>
        ) : null}
      </div>
      <h1 className="display mt-3 text-3xl text-ink">Review the draft.</h1>

      {notice ? (
        <p className="mt-4 rounded-input border border-indigo bg-indigo-tint px-4 py-2 text-sm text-indigo-deep">
          {notice}
        </p>
      ) : null}

      {draft.promoWarning ? (
        <p className="mt-4 rounded-input border border-line bg-white px-4 py-2 text-sm text-slate">
          {draft.promoWarning}
        </p>
      ) : null}

      {draft.needsPolish && draft.claudePrompt ? (
        <div className="mt-4 flex items-center gap-3 rounded-card border border-line bg-white px-5 py-4">
          <p className="flex-1 text-sm text-slate">
            No API key configured, so this draft came from the deterministic
            template. Copy the full Claude prompt and run it manually for a
            polished version.
          </p>
          <button
            onClick={() => copyText(draft.claudePrompt as string)}
            className="rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
          >
            Copy Claude prompt.
          </button>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex gap-1 border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
                  tab === t.id
                    ? "border border-b-0 border-line bg-white text-ink"
                    : "text-slate hover:text-ink"
                }`}
              >
                {t.label}
                {draft.lint[t.id].errors > 0 ? (
                  <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-indigo align-middle" />
                ) : null}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => updateText(e.target.value)}
            onBlur={saveText}
            rows={22}
            className="mt-0 w-full rounded-b-card rounded-tr-card border border-t-0 border-line bg-white p-5 font-sans text-[15px] leading-relaxed text-ink outline-none focus:border-slate"
          />
          <CharCounter text={text} />

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={regenerate}
              disabled={Boolean(busy)}
              className="rounded-input border border-ink px-4 py-2 text-sm font-semibold text-ink hover:bg-white disabled:opacity-60"
            >
              {busy?.endsWith("/regenerate") ? "Rewriting." : "Regenerate."}
            </button>
            <button
              onClick={approve}
              disabled={Boolean(busy) || blocking > 0 || draft.status !== "draft"}
              title={blocking > 0 ? "The voice gate has blocking violations." : undefined}
              className="rounded-input bg-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-deep disabled:opacity-50"
            >
              {draft.status === "draft" ? "Approve." : `Approved by ${draft.approvedBy ?? "a founder"}.`}
            </button>
          </div>

          <div className="mt-6 rounded-card border border-line bg-white p-5">
            <p className="eyebrow text-slate">Publish — {TABS.find((t) => t.id === tab)?.label}</p>
            <p className="mt-2 text-sm text-slate">
              Copy the text, open LinkedIn, paste, attach the{" "}
              {isCarousel ? "PDF as a document" : "image"}, post. Then mark it
              here.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => copyText(text)}
                className="rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
              >
                {copied ? "Copied." : "Copy text."}
              </button>
              <a
                href={LINKEDIN_SHARE}
                target="_blank"
                rel="noreferrer"
                className="rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
              >
                Open LinkedIn.
              </a>
              {isCarousel && draft.renders.pdf ? (
                <a
                  href={`${renderBase}/${draft.renders.pdf}`}
                  download
                  className="rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
                >
                  Download PDF.
                </a>
              ) : draft.renders.images[0] ? (
                <a
                  href={`${renderBase}/${draft.renders.images[0]}`}
                  download
                  className="rounded-input border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
                >
                  Download image.
                </a>
              ) : null}
              <button
                onClick={markPosted}
                disabled={postedHere || draft.status === "draft"}
                title={draft.status === "draft" ? "Approve first." : undefined}
                className="rounded-input bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-midnight disabled:opacity-50"
              >
                {postedHere ? "Posted." : "Mark posted."}
              </button>
            </div>
          </div>

          {postedHere ? (
            <StatsForm
              draftId={draft.id}
              destination={tab}
              existing={postLog.find((e) => e.destination === tab)?.stats}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <p className="eyebrow mb-3 text-slate">The visual</p>
            {draft.renders.error ? (
              <p className="rounded-card border border-line bg-white p-5 text-sm text-slate">
                Rendering failed: {draft.renders.error}
              </p>
            ) : draft.renders.images.length === 0 ? (
              <p className="rounded-card border border-line bg-white p-5 text-sm text-slate">
                No render yet.
              </p>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${renderBase}/${draft.renders.images[0]}`}
                  alt="Post visual"
                  className="w-full rounded-card border border-line bg-white"
                />
                {isCarousel && draft.renders.images.length > 1 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {draft.renders.images.map((img) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={img}
                        src={`${renderBase}/${img}`}
                        alt={img}
                        className="h-24 w-auto shrink-0 rounded-lg border border-line bg-white"
                      />
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <LintPanel result={lintResult} />
          {draft.sourceReport.length > 0 ? (
            <div className="rounded-card border border-line bg-white p-5">
              <p className="eyebrow text-slate">Source health</p>
              <ul className="mt-2 flex flex-col gap-1">
                {draft.sourceReport.map((s) => (
                  <li key={s.source} className="flex justify-between text-sm">
                    <span className={s.ok ? "text-ink" : "text-slate line-through"}>
                      {s.source}
                    </span>
                    <span className="eyebrow text-slate">
                      {s.ok ? `${s.count} items` : "skipped"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* Phone action bar: the two decisions that matter, in thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl gap-2">
          <button
            onClick={() => copyText(text)}
            className="flex-1 rounded-input border border-ink py-3 text-sm font-semibold text-ink"
          >
            {copied ? "Copied." : "Copy text."}
          </button>
          {draft.status === "draft" ? (
            <button
              onClick={approve}
              disabled={Boolean(busy) || blocking > 0}
              className="flex-1 rounded-input bg-indigo py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Approve.
            </button>
          ) : (
            <button
              onClick={markPosted}
              disabled={postedHere}
              className="flex-1 rounded-input bg-ink py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {postedHere ? "Posted." : "Mark posted."}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
