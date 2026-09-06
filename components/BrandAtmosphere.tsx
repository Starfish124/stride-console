"use client";
import { useEffect, useRef, useState } from "react";
import { StrideLogo } from "@/components/StrideLogo";

/** Decorative brand sculpture. CSS owns motion; visibility only controls playback. */
export function BrandAtmosphere() {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let visible = false;
    const update = () => { node.dataset.visible = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: .15 });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div ref={root} className="brand-atmosphere" data-visible="false" data-paused={paused}>
    <div className="brand-sculpture" aria-hidden="true">
      <div className="sculpture-orbit orbit-one" /><div className="sculpture-orbit orbit-two" />
      <div className="sculpture-body"><div className="sculpture-layer layer-back" /><div className="sculpture-layer layer-middle" /><div className="sculpture-face"><StrideLogo /><span className="sculpture-highlight" /></div></div>
      <span className="sculpture-dot dot-one" /><span className="sculpture-dot dot-two" />
    </div>
    <button type="button" className="ambient-toggle" onClick={() => setPaused(!paused)} aria-label={paused ? "Play decorative motion" : "Pause decorative motion"} aria-pressed={paused}>
      <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">{paused ? <path d="M6 3.5 16 10 6 16.5Z" /> : <><rect x="5" y="4" width="3" height="12" rx="1" /><rect x="12" y="4" width="3" height="12" rx="1" /></>}</svg>
      <span>{paused ? "Play" : "Pause"}</span>
    </button>
  </div>;
}
