"use client";

// Two ways to look at the same graph: read it, or see it.

import { useState } from "react";
import { GraphMap } from "@/components/GraphMap";

export function GraphViews({ hasDrawing }: { hasDrawing: boolean }) {
  const [drawn, setDrawn] = useState(false);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="How to view the graph"
        className="inline-flex rounded-input border border-line bg-white p-0.5"
      >
        {[
          { id: false, label: "Read it", hint: "The parts, and what leans on what" },
          { id: true, label: "See it", hint: "The whole thing drawn" },
        ].map((tab) => (
          <button
            key={String(tab.id)}
            role="tab"
            aria-selected={drawn === tab.id}
            title={tab.hint}
            onClick={() => setDrawn(tab.id)}
            className={`rounded-[8px] px-3.5 py-1.5 text-sm pressable ${
              drawn === tab.id ? "bg-indigo text-white" : "text-slate hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {drawn ? (
        hasDrawing ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-card border border-line bg-white">
              <iframe
                src="/api/graph/view"
                title="The Stride knowledge graph, drawn"
                className="h-[75vh] w-full"
              />
            </div>
            <p className="text-xs text-mute">
              Every codebase and every session in one picture. Clusters are numbered
              rather than named — naming them needs a model, and the nightly build
              stays offline. Nodes carry their own labels.{" "}
              <a
                href="/api/graph/view"
                target="_blank"
                rel="noreferrer"
                className="text-indigo hover:text-indigo-deep"
              >
                Open it full screen
              </a>
              .
            </p>
          </div>
        ) : (
          <p className="text-sm text-mute">Nothing drawn yet. Press rebuild.</p>
        )
      ) : (
        <GraphMap />
      )}
    </div>
  );
}
