"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InboxEntry } from "@/lib/types";

/** The ready-to-review banner. Pregen fills the inbox; a founder dismisses it. */
export function InboxBanner({ entries }: { entries: InboxEntry[] }) {
  const router = useRouter();
  if (entries.length === 0) return null;

  async function dismiss() {
    await fetch("/api/inbox", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-card border border-indigo bg-indigo-tint px-5 py-4">
      <p className="eyebrow text-indigo">Ready to review</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink">{e.message}</span>
            <Link
              href={`/drafts/${e.draftId}`}
              className="text-sm font-semibold text-indigo hover:text-indigo-deep"
            >
              Open the draft.
            </Link>
          </li>
        ))}
      </ul>
      <button
        onClick={dismiss}
        className="eyebrow mt-3 rounded-input border border-indigo px-3 py-1 text-indigo hover:bg-white"
      >
        Dismiss
      </button>
    </div>
  );
}
