"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

/** A small ✕ that DELETEs a URL and refreshes the page it sits on. */
export function DeleteX({ url, ask, label }: { url: string; ask: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async () => {
        if (!confirm(ask)) return;
        const res = await fetch(url, { method: "DELETE" });
        if (res.ok) {
          toast(label.replace(/^Remove |^Delete /, "Removed: "));
          router.refresh();
        } else {
          toast.error("That did not delete. Try again.");
        }
      }}
      className="pressable shrink-0 rounded px-1.5 py-0.5 text-sm text-mute hover:text-amber"
    >
      ✕
    </button>
  );
}
