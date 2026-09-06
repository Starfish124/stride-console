"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ImportResult {
  imported: { name: string; company: string }[];
  known: { name: string; company: string; matched: string }[];
  unusable: { name: string; company: string; why: string }[];
  dryRun: boolean;
}

/**
 * Copying the lead book into the client book, in two presses.
 *
 * The first press reports and writes nothing. data/ is gitignored, so
 * clients.json has no history — an import that mapped a field wrong cannot be
 * checked out again, and the founders' real clients are in the same file. A
 * preview costs one click and is the only undo there is.
 */
export function LeadImport({ total }: { total: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ImportResult | undefined>();
  const [note, setNote] = useState("");

  function run(confirm: boolean) {
    setNote("");
    startTransition(async () => {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = (await res.json().catch(() => ({}))) as ImportResult & { error?: string };
      if (!res.ok) {
        setNote(json.error ?? "That did not work.");
        return;
      }
      if (confirm) {
        setPreview(undefined);
        setNote(`${json.imported.length} added to the client book.`);
        router.refresh();
        return;
      }
      setPreview(json);
    });
  }

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(false)}
          className="pressable rounded-input border border-line px-4 py-2 text-[14px] text-ink disabled:opacity-50"
        >
          {pending && !preview ? "Checking." : "Check what would be added"}
        </button>

        {preview && preview.imported.length > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(true)}
            className="pressable rounded-input bg-ink px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Adding." : `Add ${preview.imported.length} to the client book`}
          </button>
        ) : null}
      </div>

      {preview ? (
        <p className="text-[14px] text-slate">
          {preview.imported.length} new,{" "}
          {preview.known.length > 0 ? `${preview.known.length} already in the book` : "none already known"}
          {preview.unusable.length > 0 ? `, ${preview.unusable.length} with no name or company` : ""}.
          {preview.imported.length === 0 ? " Nothing to do." : " Nothing has been written yet."}
        </p>
      ) : null}

      {note ? <p className="text-[14px] text-ink">{note}</p> : null}
    </div>
  );
}
