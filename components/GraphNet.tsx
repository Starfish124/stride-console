"use client";

// The graph drawn as a network, on our own canvas.
//
// What this replaces: an iframe onto graphify's vis-network page. That page is
// dark, off-brand, pulls a library off a CDN, draws a dot per function, and
// ships its own left sidebar with `display:flex; height:100vh` — which on a
// phone takes the full width and squeezes the drawing to nothing. That is why
// the phone only ever showed a menu.
//
// So: file-level nodes, clustered by repo so the picture has lobes instead of
// being one ball of wool, labels only where they earn their space, and tapping
// a node dims everything that is not next to it. The dimming is the feature —
// a network you can read one neighbourhood at a time.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface NetNode {
  key: string;
  id: string;
  label: string;
  repo: string;
  file: string;
  kind: "code" | "doc" | "session";
  weight: number;
  date?: string;
}

interface NetLink {
  s: number;
  t: number;
  w: number;
  touched: boolean;
}

interface Net {
  built: boolean;
  nodes: NetNode[];
  links: NetLink[];
  repos: string[];
  hidden: number;
}

interface Neighbourhood {
  id: string;
  label: string;
  repo: string;
  file: string;
  dependsOn: { id: string; label: string; repo: string }[];
  dependedOnBy: { id: string; label: string; repo: string }[];
  touchedBy: { id: string; label: string; date: string }[];
}

/** Brand colours, one per body of work. Sessions are deliberately the odd one. */
const REPO_COLOUR: Record<string, string> = {
  "stride-console": "#2e30f8",
  "ai-agency-website": "#2ba6ff",
  "stride-pitch": "#6d6ffa",
  sessions: "#ffa92b",
};
const FALLBACK = ["#76b900", "#8a90a0", "#2325c9"];

function colourFor(repo: string, repos: string[]): string {
  return REPO_COLOUR[repo] ?? FALLBACK[repos.indexOf(repo) % FALLBACK.length];
}

/** Deterministic seed, so the same graph draws the same way every reload. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function GraphNet() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [net, setNet] = useState<Net | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<Neighbourhood | null>(null);
  const [settling, setSettling] = useState(true);

  // Mutable simulation state, deliberately outside React: it changes 60 times a
  // second and nothing in the tree needs to re-render when it does.
  const bodies = useRef<Body[]>([]);
  const view = useRef({ x: 0, y: 0, scale: 1 });
  const hover = useRef<number | null>(null);
  const alpha = useRef(1);
  const frame = useRef(0);
  // Selection is read by the draw loop, not by the simulation. Keeping it in
  // state alone would put it in the effect's dependencies, and every tap would
  // tear the layout down and re-run it — the graph visibly jumping each time
  // you touch it. The picture must hold still while you explore it.
  const selectedRef = useRef<number | null>(null);
  const dirty = useRef(true);
  // Where the view is heading. Selecting a node moves the camera onto its
  // neighbourhood instead of leaving it as three specks in a corner; clearing
  // the selection goes back to the whole graph.
  const target = useRef<{ x: number; y: number; scale: number } | null>(null);
  const home = useRef<{ x: number; y: number; scale: number } | null>(null);


  useEffect(() => {
    let live = true;
    void fetch("/api/graph/net", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (live) setNet(body);
      });
    return () => {
      live = false;
    };
  }, []);

  /** Who is next to whom, for the one-hop highlight. */
  const neighbours = useMemo(() => {
    const map = new Map<number, Set<number>>();
    if (!net) return map;
    for (const link of net.links) {
      if (!map.has(link.s)) map.set(link.s, new Set());
      if (!map.has(link.t)) map.set(link.t, new Set());
      map.get(link.s)!.add(link.t);
      map.get(link.t)!.add(link.s);
    }
    return map;
  }, [net]);

  const open = useCallback(async (id: string) => {
    const res = await fetch(`/api/graph/map?node=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (res.ok) setFocus(await res.json());
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
    dirty.current = true;

    const wrap = wrapRef.current;
    const bs = bodies.current;
    if (!wrap || bs.length === 0) return;

    if (selected === null) {
      target.current = home.current;
      return;
    }

    const group = [selected, ...(neighbours.get(selected) ?? [])];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const i of group) {
      const b = bs[i];
      if (!b) continue;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x);
      maxY = Math.max(maxY, b.y);
    }
    if (!Number.isFinite(minX)) return;

    const w = wrap.clientWidth;
    const usable = wrap.clientHeight - (w < 640 ? 56 : 34);
    // Capped: a node with one neighbour would otherwise fill the screen at 20×.
    const scale = Math.min(w / (maxX - minX + 260), usable / (maxY - minY + 260), 2.2);
    target.current = {
      scale,
      x: w / 2 - ((minX + maxX) / 2) * scale,
      y: usable / 2 - ((minY + maxY) / 2) * scale,
    };
  }, [selected, neighbours]);

  // ——— the simulation ———————————————————————————————————————————————
  useEffect(() => {
    if (!net?.built || net.nodes.length === 0) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const nodes = net.nodes;
    const links = net.links;

    // Each repo gets its own centre on a ring, and nodes start near their own.
    // Structure from the first frame beats watching a ball of wool untangle.
    // On a phone the canvas is tall and narrow, so a circle of repo centres
    // lays the graph out as a wide ribbon with dead space above and below it.
    // Squash the ring to match the canvas and the same graph fills the screen.
    const portrait = wrap.clientHeight > wrap.clientWidth;
    const rx = portrait ? 200 : 580;
    const ry = portrait ? 520 : 380;
    const repoAt = new Map<string, { x: number; y: number }>();
    net.repos.forEach((repo, i) => {
      const angle = (i / net.repos.length) * Math.PI * 2 - Math.PI / 2;
      repoAt.set(repo, { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry });
    });

    bodies.current = nodes.map((node) => {
      const centre = repoAt.get(node.repo) ?? { x: 0, y: 0 };
      const angle = hash(node.key) * Math.PI * 2;
      const spread = 40 + hash(node.file || node.key) * 200;
      return {
        x: centre.x + Math.cos(angle) * spread,
        y: centre.y + Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
        // Size by how much leans on it, damped so the spine stands out without
        // one file becoming a planet. Sessions get a floor: they are the story
        // this page tells, and a 3px ring reads as a speck of dust.
        r:
          node.kind === "session"
            ? 4.5 + Math.min(6, Math.sqrt(node.weight) * 1.4)
            : 3 + Math.min(11, Math.sqrt(node.weight) * 1.6),
      };
    });

    alpha.current = 1;
    setSettling(true);

    function tick() {
      const a = alpha.current;
      const bs = bodies.current;
      const n = bs.length;

      // ponytail: O(n²) repulsion. n is ~575, so this is ~165k pairs a frame and
      // costs under 2ms. Barnes-Hut only if the corpus passes a few thousand.
      for (let i = 0; i < n; i += 1) {
        const bi = bs[i];
        for (let j = i + 1; j < n; j += 1) {
          const bj = bs[j];
          let dx = bj.x - bi.x;
          let dy = bj.y - bi.y;
          let d2 = dx * dx + dy * dy;
          if (d2 > 90000) continue;
          if (d2 < 1) {
            dx = (hash(`${i}:${j}`) - 0.5) * 2;
            dy = (hash(`${j}:${i}`) - 0.5) * 2;
            d2 = 1;
          }
          const force = (900 * a) / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          bi.vx -= fx;
          bi.vy -= fy;
          bj.vx += fx;
          bj.vy += fy;
        }
      }

      // Springs. A heavier link pulls harder, so files that lean on each other
      // a lot end up sitting together.
      for (const link of links) {
        const bi = bs[link.s];
        const bj = bs[link.t];
        if (!bi || !bj) continue;
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = link.touched ? 150 : 70;
        const pull = ((d - rest) / d) * 0.012 * Math.min(4, link.w) * a;
        const fx = dx * pull;
        const fy = dy * pull;
        bi.vx += fx;
        bi.vy += fy;
        bj.vx -= fx;
        bj.vy -= fy;
      }

      // Gravity toward the node's own repo centre: this is what makes lobes.
      for (let i = 0; i < n; i += 1) {
        const centre = repoAt.get(nodes[i].repo) ?? { x: 0, y: 0 };
        // Pull toward the node's own repo centre. This is the single number
        // that decides whether the picture has lobes or is one ball of wool.
        bs[i].vx += (centre.x - bs[i].x) * 0.013 * a;
        bs[i].vy += (centre.y - bs[i].y) * 0.013 * a;
        bs[i].vx *= 0.82;
        bs[i].vy *= 0.82;
        bs[i].x += bs[i].vx;
        bs[i].y += bs[i].vy;
      }

      alpha.current = a * 0.985;
    }

    function fit() {
      const bs = bodies.current;
      if (bs.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const b of bs) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x);
        maxY = Math.max(maxY, b.y);
      }
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      // The legend sits over the bottom-left of the drawing, and wraps to two
      // rows on a phone. Fit into the space above it so it never covers a node.
      const inset = w < 640 ? 56 : 34;
      const usable = h - inset;
      const scale = Math.min(w / (maxX - minX + 120), usable / (maxY - minY + 120), 1.6);
      view.current = {
        scale,
        x: w / 2 - ((minX + maxX) / 2) * scale,
        y: usable / 2 - ((minY + maxY) / 2) * scale,
      };
      // The view to come back to when a selection is cleared.
      home.current = { ...view.current };
    }

    function draw() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      if (canvas!.width !== w * dpr || canvas!.height !== h * dpr) {
        canvas!.width = w * dpr;
        canvas!.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { x: ox, y: oy, scale } = view.current;
      const bs = bodies.current;
      const active = selectedRef.current ?? hover.current;
      const near = active === null ? null : neighbours.get(active);
      const lit = (i: number) =>
        active === null || i === active || (near?.has(i) ?? false);

      // Edges first, under everything.
      ctx.lineCap = "round";
      for (const link of links) {
        const bi = bs[link.s];
        const bj = bs[link.t];
        if (!bi || !bj) continue;
        const on = active === null || link.s === active || link.t === active;
        if (active !== null && !on) continue;
        ctx.strokeStyle = link.touched
          ? `rgba(255,169,43,${on && active !== null ? 0.75 : 0.28})`
          : `rgba(90,97,114,${active !== null ? 0.5 : 0.13})`;
        ctx.lineWidth = Math.min(2.5, 0.5 + link.w * 0.18) * (active !== null ? 1.4 : 1);
        ctx.beginPath();
        ctx.moveTo(bi.x * scale + ox, bi.y * scale + oy);
        ctx.lineTo(bj.x * scale + ox, bj.y * scale + oy);
        ctx.stroke();
      }

      // Nodes.
      for (let i = 0; i < bs.length; i += 1) {
        const b = bs[i];
        const node = nodes[i];
        const px = b.x * scale + ox;
        const py = b.y * scale + oy;
        const r = Math.max(2, b.r * Math.min(1.4, scale));
        if (px < -60 || py < -60 || px > w + 60 || py > h + 60) continue;
        const on = lit(i);
        const colour = colourFor(node.repo, net!.repos);

        if (on && (b.r > 6 || i === active)) {
          // A soft halo on the load-bearing ones: the "neural" read, and it
          // makes the spine findable at a glance.
          const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 4);
          glow.addColorStop(0, `${colour}44`);
          glow.addColorStop(1, `${colour}00`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(px, py, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = on ? 1 : 0.12;
        ctx.fillStyle = node.kind === "session" ? "#fff" : colour;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        if (node.kind === "session") {
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (i === active) {
          ctx.strokeStyle = "#0a0c14";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Labels last, and this is where readability is won or lost. Two rules:
      // the heaviest nodes get first claim on the space, and a label that would
      // land on one already drawn is simply dropped. An unreadable pile of
      // overlapping names tells you less than six names you can actually read.
      ctx.font = "500 11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const budget = w < 640 ? 12 : 26;
      const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const order = bs
        .map((b, i) => ({ i, r: b.r }))
        .filter(({ i }) => lit(i))
        .sort((a, b2) => (a.i === active ? -1 : b2.i === active ? 1 : b2.r - a.r));

      let drawn = 0;
      for (const { i } of order) {
        if (drawn >= budget && i !== active) break;
        const b = bs[i];
        const px = b.x * scale + ox;
        const py = b.y * scale + oy;
        if (px < 0 || py < 0 || px > w || py > h) continue;
        const text = nodes[i].label;
        const r = Math.max(2, b.r * Math.min(1.4, scale));
        const tw = ctx.measureText(text).width;
        // Keep the label on the canvas: a name sliced by the card edge is worse
        // than no name, and on a phone the outer lobes sit right against it.
        const cx = Math.min(Math.max(px, tw / 2 + 6), w - tw / 2 - 6);
        const box = {
          x0: cx - tw / 2 - 3,
          y0: py + r + 3,
          x1: cx + tw / 2 + 3,
          y1: py + r + 17,
        };
        const clash = taken.some(
          (t) => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0,
        );
        if (clash && i !== active) continue;
        taken.push(box);
        drawn += 1;
        ctx.fillStyle = "rgba(246,247,250,0.92)";
        ctx.fillRect(box.x0, box.y0, tw + 6, 14);
        ctx.fillStyle = i === active ? "#0a0c14" : "#5a6172";
        ctx.fillText(text, cx, py + r + 4);
      }
    }

    let running = true;
    function loop() {
      if (alpha.current > 0.02) {
        tick();
        fit();
        draw();
      } else {
        if (running) {
          running = false;
          setSettling(false);
        }
        // Glide the camera toward whatever was selected. Jumping there instantly
        // loses people: they cannot tell a new view from a redrawn graph.
        const to = target.current;
        if (to) {
          const v = view.current;
          const dx = to.x - v.x;
          const dy = to.y - v.y;
          const ds = to.scale - v.scale;
          if (Math.abs(dx) + Math.abs(dy) < 0.5 && Math.abs(ds) < 0.001) {
            target.current = null;
          } else {
            view.current = {
              x: v.x + dx * 0.18,
              y: v.y + dy * 0.18,
              scale: v.scale + ds * 0.18,
            };
            dirty.current = true;
          }
        }
        // Settled: only redraw when something actually changed. A canvas
        // repainting 60 times a second at rest is a phone's battery for nothing.
        if (dirty.current) {
          dirty.current = false;
          draw();
        }
      }
      frame.current = requestAnimationFrame(loop);
    }

    fit();
    frame.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame.current);
    // `settling` is written here, never read: listing it would restart the
    // simulation on its own state change and loop forever.
  }, [net, neighbours]);

  // ——— pointer: drag to pan, wheel/pinch to zoom, tap to select ————————
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !net?.built) return;
    const points = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;

    const at = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const hit = (px: number, py: number): number | null => {
      const { x: ox, y: oy, scale } = view.current;
      let best: number | null = null;
      let bestD = 18 * 18;
      bodies.current.forEach((b, i) => {
        const dx = b.x * scale + ox - px;
        const dy = b.y * scale + oy - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };

    const zoomAt = (px: number, py: number, factor: number) => {
      const v = view.current;
      const next = Math.max(0.15, Math.min(6, v.scale * factor));
      const k = next / v.scale;
      view.current = { scale: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      target.current = null;
      dirty.current = true;
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      points.set(e.pointerId, at(e));
      moved = 0;
      pinch = 0;
    };

    const onMove = (e: PointerEvent) => {
      const now = at(e);
      const prev = points.get(e.pointerId);
      if (!prev) {
        // Hover highlight is a mouse affordance; touch has tap.
        if (e.pointerType === "mouse") {
          const next = hit(now.x, now.y);
          if (next !== hover.current) {
            hover.current = next;
            dirty.current = true;
          }
        }
        return;
      }
      points.set(e.pointerId, now);
      moved += Math.abs(now.x - prev.x) + Math.abs(now.y - prev.y);

      if (points.size >= 2) {
        const [a, b] = [...points.values()];
        const span = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, span / pinch);
        }
        pinch = span;
        return;
      }
      view.current.x += now.x - prev.x;
      view.current.y += now.y - prev.y;
      // The user has taken the camera; stop gliding it somewhere else.
      target.current = null;
      dirty.current = true;
    };

    const onUp = (e: PointerEvent) => {
      const point = points.get(e.pointerId);
      points.delete(e.pointerId);
      if (points.size > 0 || !point) return;
      if (moved < 8) {
        const index = hit(point.x, point.y);
        setSelected(index);
        if (index === null) setFocus(null);
        else void open(net.nodes[index].id);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.002));
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [net, open]);

  if (!net) return <p className="text-sm text-mute">Reading the graph…</p>;
  if (!net.built) return <p className="text-sm text-mute">No graph yet. Press rebuild.</p>;

  const chosen = selected === null ? null : net.nodes[selected];

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="relative h-[52vh] min-h-[360px] overflow-hidden rounded-card border border-line bg-white sm:h-[68vh]"
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ cursor: "grab" }}
          aria-label="The Stride knowledge graph, drawn as a network of files"
        />

        {settling && (
          <p className="tabular pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-input bg-ink/80 px-3 py-1 text-xs text-white">
            Settling…
          </p>
        )}

        {/* Legend, over the drawing where it is read, not below it. */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-input bg-white/85 px-2.5 py-1.5 backdrop-blur">
          {net.repos.map((repo) => (
            <span key={repo} className="flex items-center gap-1.5 text-xs text-slate">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: colourFor(repo, net.repos) }}
              />
              {repo === "sessions" ? "sessions" : repo}
            </span>
          ))}
        </div>

        {selected !== null && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setFocus(null);
            }}
            className="absolute right-3 top-3 rounded-input border border-line bg-white/90 px-3 py-1.5 text-xs text-slate backdrop-blur pressable"
          >
            Show everything
          </button>
        )}
      </div>

      <p className="text-xs text-mute">
        One dot per file, sized by how much leans on it, clustered by codebase.
        Orange lines are sessions that worked in a file. Tap a dot to see only its
        neighbourhood; drag to pan, pinch or scroll to zoom.{" "}
        <span className="tabular">{net.nodes.length}</span> files,{" "}
        <span className="tabular">{net.links.length}</span> connections
        {net.hidden > 0 && <> · {net.hidden} unconnected files left out</>}.
      </p>

      {chosen && (
        <div className="rounded-card border border-indigo/40 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{chosen.label}</p>
              <p className="tabular truncate text-xs text-mute">
                {chosen.repo}
                {chosen.file && ` · ${chosen.file}`}
              </p>
            </div>
            <span className="tabular shrink-0 text-xs text-slate">
              {chosen.weight} lean on it
            </span>
          </div>
          {focus ? (
            <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
              <Column title="Leans on" items={focus.dependsOn} />
              <Column title="Leaned on by" items={focus.dependedOnBy} />
              {focus.touchedBy.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="eyebrow text-slate">Sessions that worked in here</p>
                  <ul className="mt-1 space-y-1">
                    {focus.touchedBy.map((s) => (
                      <li key={s.id} className="text-xs text-slate">
                        <span className="tabular text-mute">{s.date}</span> — {s.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-mute">Reading its neighbourhood…</p>
          )}
        </div>
      )}
    </div>
  );
}

function Column({ title, items }: { title: string; items: { id: string; label: string }[] }) {
  return (
    <div>
      <p className="eyebrow text-slate">
        {title} {items.length > 0 && `· ${items.length}`}
      </p>
      <ul className="mt-1 space-y-1">
        {items.length === 0 && <li className="text-xs text-mute">Nothing.</li>}
        {items.slice(0, 12).map((n) => (
          <li key={n.id} className="truncate text-xs text-slate">
            {n.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
