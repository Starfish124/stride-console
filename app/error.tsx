"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconEscalate } from "@/components/icons";

/**
 * When a page throws.
 *
 * There was no boundary at all, so any uncaught error on any of eighteen pages
 * dropped a founder onto Next's own error screen — which, inside a home-screen
 * app with no address bar, reads as the app having crashed with no way back.
 *
 * This says what happened in plain words, offers the two things that actually
 * help (try again, go home), and keeps the real message visible rather than
 * hidden: the two people who see this screen are the two who can fix it.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nothing collects these, so the server log is where it goes. Better than
    // an error that exists only on a phone the maintainer is not holding.
    console.error("Console page error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6">
      <IconEscalate size={26} className="text-amber" />
      <h1 className="title-large mt-4 text-ink">That page broke.</h1>
      <p className="mt-2 text-slate">
        Nothing was lost. Everything the console knows is on disk, and this only
        stopped the screen from drawing.
      </p>

      <p className="mt-5 overflow-x-auto rounded-card border border-line bg-white px-4 py-3 font-mono text-[12px] leading-relaxed text-slate">
        {error.message || "No message came with it."}
        {error.digest && (
          <>
            <br />
            digest {error.digest}
          </>
        )}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-input border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-midnight"
        >
          Try again.
        </button>
        <Link
          href="/"
          className="rounded-input border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo"
        >
          Back to the console.
        </Link>
      </div>
    </main>
  );
}
