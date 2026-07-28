"use client";

/**
 * Save as PDF, by way of the browser's own print dialog — which is the only
 * PDF writer here that already agrees with the page's own layout.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-input border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-midnight"
    >
      Save as PDF.
    </button>
  );
}
