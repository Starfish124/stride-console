"use client";

// Two ways to look at the same graph: read it, or see it.

import { useState } from "react";
import { GraphMap } from "@/components/GraphMap";
import { GraphNet } from "@/components/GraphNet";

export function GraphViews({ hasDrawing }: { hasDrawing: boolean }) {
  // The drawing leads. It is the thing worth looking at, and the thing a
  // founder is shown first.
  const [drawn, setDrawn] = useState(true);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="How to view the graph"
        className="inline-flex rounded-input border border-line bg-white p-0.5"
      >
        {[
          { id: true, label: "See it", hint: "The whole thing drawn as a network" },
          { id: false, label: "Read it", hint: "The parts, and what leans on what" },
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
        <div className="space-y-2">
          <GraphNet />
          {hasDrawing && (
            <p className="text-xs text-mute">
              graphify&apos;s own render, a dot per function rather than per file, is
              still there if you want the raw extraction:{" "}
              <a
                href="/api/graph/view"
                target="_blank"
                rel="noreferrer"
                className="text-indigo hover:text-indigo-deep"
              >
                open it full screen
              </a>
              .
            </p>
          )}
        </div>
      ) : (
        <GraphMap />
      )}
    </div>
  );
}
