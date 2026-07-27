"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EVENT_RECIPES, RECIPE_LABELS, type EventRecipeId } from "@/lib/types";
import { Working } from "@/components/Loader";

const DESCRIPTIONS: Record<EventRecipeId, string> = {
  eventAnnounce: "Date, venue, format. The first post of the cycle.",
  eventLineup: "The startups pitching, one line each.",
  eventReminder: "Seven days out. Format plus the remaining seats.",
  eventRecap: "The morning after. What we watched and learned.",
};

export function EventRecipeButtons({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function run(recipe: EventRecipeId) {
    setBusy(recipe);
    setError(undefined);
    try {
      const res = await fetch(`/api/run/${recipe}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (res.ok && data.id) {
        router.push(`/drafts/${data.id}`);
        return;
      }
      setError(data.error ?? "The run failed.");
    } catch {
      setError("The run failed.");
    }
    setBusy(undefined);
  }

  return (
    <div className="card-glass rounded-card border border-line bg-white p-6">
      <p className="eyebrow text-slate">Event posts</p>
      <p className="mt-2 text-sm text-slate">
        Four recipes, same pipeline, same voice gate. The runner warns when an
        event post would be the third post of the week.
      </p>
      {error ? <p className="mt-3 text-xs text-indigo-deep">{error}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {EVENT_RECIPES.map((recipe, i) => (
          <button
            key={recipe}
            onClick={() => run(recipe)}
            disabled={Boolean(busy)}
            className="flex flex-col items-start rounded-card border border-line p-4 text-left hover:border-indigo disabled:opacity-60"
          >
            <span className="eyebrow text-indigo">{String(i + 1).padStart(2, "0")}</span>
            <span className="mt-2 text-sm font-semibold text-ink">
              {busy === recipe ? (
                <Working>Running the pipeline.</Working>
              ) : (
                `${RECIPE_LABELS[recipe]}.`
              )}
            </span>
            <span className="mt-1 text-xs text-slate">{DESCRIPTIONS[recipe]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
