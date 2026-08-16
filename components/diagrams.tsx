import { BRAND } from "@/lib/brand";

/**
 * Editorial diagrams, in Stride's own brand — not a chart library.
 *
 * The grammar follows the same rules as the icon library: no shadows, no
 * gradients, small radii, hairline strokes, and exactly one accent colour
 * used sparingly — indigo marks the one node per diagram that earns it (a
 * conversion, a decision gate), never a whole palette of "important" hues.
 * Every diagram here is built from data the caller already has; there is no
 * decorative filler node and no invented number. If a diagram would need one
 * to look complete, the fix is fewer nodes, not a fake one.
 *
 * Typography borrows the console's own registers rather than importing
 * anything: --font-display for node names, --font-mono for sublabels and
 * the small uppercase counts — the same fonts behind `.display` and
 * `.eyebrow` elsewhere in the console, just set inline because SVG text
 * does not inherit page classes reliably across the print/portal boundary.
 * Each diagram sits under the page's own heading, so none of these draw a
 * title of their own.
 */

const FONT_DISPLAY = "var(--font-display)";
const FONT_MONO = "var(--font-mono)";

// ---------- Funnel: ranked stages, honest widths ----------

export interface FunnelLayer {
  label: string;
  count: number;
  hint?: string;
}

/**
 * A pipeline drawn as a funnel — widths proportional to the real count in
 * each stage, never evenly spaced for looks. The narrowest, final layer is
 * the one conversion this diagram exists to show, so it is the one place
 * indigo appears; every other layer stays ink-on-white.
 */
export function FunnelDiagram({ layers, className }: { layers: FunnelLayer[]; className?: string }) {
  const W = 640;
  const layerH = 60;
  const gap = 6;
  const maxW = 560;
  const minW = 140;
  const top = 28;
  const total = Math.max(...layers.map((l) => l.count), 1);

  const widthFor = (count: number) => {
    if (total === 0) return minW;
    const t = count / total;
    return Math.round(minW + (maxW - minW) * t);
  };

  const H = top + layers.length * (layerH + gap);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Pipeline funnel">
      {layers.map((layer, i) => {
        const w = widthFor(layer.count);
        const wNext = i < layers.length - 1 ? widthFor(layers[i + 1].count) : w;
        const y = top + i * (layerH + gap);
        const cx = W / 2;
        const topHalf = w / 2;
        const botHalf = wNext / 2;
        const focal = i === layers.length - 1;
        const points = [
          [cx - topHalf, y],
          [cx + topHalf, y],
          [cx + botHalf, y + layerH],
          [cx - botHalf, y + layerH],
        ]
          .map((p) => p.join(","))
          .join(" ");
        return (
          <g key={layer.label}>
            <polygon
              points={points}
              fill={focal ? BRAND.indigoTint : BRAND.white}
              stroke={focal ? BRAND.indigo : BRAND.line}
              strokeWidth={focal ? 1.5 : 1}
            />
            <text
              x={cx}
              y={y + layerH / 2 - 3}
              textAnchor="middle"
              fontFamily={FONT_DISPLAY}
              fontSize={13}
              fontWeight={600}
              fill={BRAND.ink}
            >
              {layer.label}
            </text>
            <text
              x={cx}
              y={y + layerH / 2 + 13}
              textAnchor="middle"
              fontFamily={FONT_MONO}
              fontSize={10}
              fill={focal ? BRAND.indigo : BRAND.slate}
            >
              {layer.count} {layer.count === 1 ? "in play" : "in play"}
            </text>
            {layer.hint && (
              <text
                x={cx + Math.max(topHalf, botHalf) + 16}
                y={y + layerH / 2 + 3}
                fontFamily={FONT_MONO}
                fontSize={9}
                fill={BRAND.mute}
              >
                {layer.hint}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Loop: a reinforcing cycle around a shared hub ----------

export interface LoopStation {
  name: string;
  sublabel?: string;
  focal?: boolean;
}

/**
 * A flywheel: stations arranged clockwise around one hub, a dashed spoke
 * from every station back to the hub (the write-back — each pass updates
 * shared state), and a solid arc carrying the work from station to station.
 * Built for 5–8 stations; more than that and it stops being readable at a
 * glance, which is the whole point of drawing it instead of listing it.
 */
export function LoopDiagram({
  hub,
  stations,
  className,
}: {
  hub: { name: string; sublabel?: string };
  stations: LoopStation[];
  className?: string;
}) {
  const cx = 280;
  const cy = 260;
  const R = 175;
  const stationW = 128;
  const stationH = 52;
  const hubW = 148;
  const hubH = 76;
  const W = 560;
  const H = 520;
  const N = stations.length;

  const pos = (k: number) => {
    const theta = -Math.PI / 2 + k * ((2 * Math.PI) / N);
    return { x: cx + R * Math.cos(theta), y: cy + R * Math.sin(theta), theta };
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Operating loop">
      <defs>
        <marker id="loop-arrow" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 7 3, 0 6" fill={BRAND.slate} />
        </marker>
      </defs>

      {/* The ring itself — a faint guide, not a shape anyone reads directly. */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={BRAND.line} strokeWidth={1} strokeDasharray="1 4" />

      {/* Write-back spokes: every station keeps talking to the shared hub. */}
      {stations.map((s, k) => {
        const p = pos(k);
        return (
          <line
            key={`spoke-${s.name}`}
            x1={p.x}
            y1={p.y}
            x2={cx}
            y2={cy}
            stroke={BRAND.line}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })}

      {/* Flow arcs, station to station, clockwise. */}
      {stations.map((s, k) => {
        const a = pos(k);
        const b = pos((k + 1) % N);
        // A gentle outward bow so the arc reads as motion, not a straight spoke.
        const mx = cx + (R + 34) * Math.cos((a.theta + b.theta) / 2);
        const my = cy + (R + 34) * Math.sin((a.theta + b.theta) / 2);
        return (
          <path
            key={`arc-${s.name}`}
            d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
            fill="none"
            stroke={BRAND.slate}
            strokeWidth={1.4}
            markerEnd="url(#loop-arrow)"
          />
        );
      })}

      {/* The hub — every station writes back here. */}
      <rect
        x={cx - hubW / 2}
        y={cy - hubH / 2}
        width={hubW}
        height={hubH}
        rx={8}
        fill={BRAND.indigoTint}
        stroke={BRAND.indigo}
        strokeWidth={1.5}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontFamily={FONT_DISPLAY} fontSize={13} fontWeight={600} fill={BRAND.indigo}>
        {hub.name}
      </text>
      {hub.sublabel && (
        <text x={cx} y={cy + 13} textAnchor="middle" fontFamily={FONT_MONO} fontSize={9} fill={BRAND.indigoDeep}>
          {hub.sublabel}
        </text>
      )}

      {/* Stations. */}
      {stations.map((s, k) => {
        const p = pos(k);
        const focal = Boolean(s.focal);
        return (
          <g key={s.name}>
            <rect
              x={p.x - stationW / 2}
              y={p.y - stationH / 2}
              width={stationW}
              height={stationH}
              rx={7}
              fill={focal ? BRAND.indigoTint : BRAND.white}
              stroke={focal ? BRAND.indigo : BRAND.line}
              strokeWidth={focal ? 1.5 : 1}
            />
            <text x={p.x} y={p.y - 2} textAnchor="middle" fontFamily={FONT_DISPLAY} fontSize={12} fontWeight={600} fill={BRAND.ink}>
              {s.name}
            </text>
            {s.sublabel && (
              <text x={p.x} y={p.y + 14} textAnchor="middle" fontFamily={FONT_MONO} fontSize={8.5} fill={BRAND.slate}>
                {s.sublabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Timeline: real dated events on one axis ----------

export interface TimelineEvent {
  date: string;
  label: string;
  sublabel?: string;
  focal?: boolean;
}

/**
 * Events on a line, oldest to newest, alternating above/below the axis so
 * labels never collide. Spacing is by order, not by literal elapsed time —
 * honest about what happened and when (the date is always printed), not a
 * claim about pacing.
 */
export function TimelineDiagram({ events, className }: { events: TimelineEvent[]; className?: string }) {
  const W = 640;
  const H = 220;
  const axisY = H / 2;
  const marginX = 48;
  const step = events.length > 1 ? (W - marginX * 2) / (events.length - 1) : 0;

  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Engagement timeline">
      <line x1={marginX} y1={axisY} x2={W - marginX} y2={axisY} stroke={BRAND.line} strokeWidth={1.5} />
      {events.map((e, i) => {
        const x = marginX + step * i;
        const above = i % 2 === 0;
        const focal = Boolean(e.focal);
        const labelY = above ? axisY - 24 : axisY + 34;
        const dateY = above ? axisY - 10 : axisY + 48;
        // The end labels sit right at the viewBox edge — centering them on
        // their point would run half the text off-canvas. Grow the first
        // one rightward and the last one leftward instead; everything
        // between keeps the centered anchor.
        const anchor = i === 0 ? "start" : i === events.length - 1 ? "end" : "middle";
        return (
          <g key={`${e.date}-${e.label}`}>
            <line x1={x} y1={axisY} x2={x} y2={above ? axisY - 6 : axisY + 6} stroke={BRAND.line} strokeWidth={1} />
            <circle cx={x} cy={axisY} r={focal ? 6 : 4} fill={focal ? BRAND.indigo : BRAND.white} stroke={focal ? BRAND.indigo : BRAND.slate} strokeWidth={1.5} />
            <text x={x} y={labelY} textAnchor={anchor} fontFamily={FONT_DISPLAY} fontSize={12} fontWeight={600} fill={focal ? BRAND.indigo : BRAND.ink}>
              {e.label}
            </text>
            {e.sublabel && (
              <text x={x} y={labelY + (above ? 13 : -13)} textAnchor={anchor} fontFamily={FONT_MONO} fontSize={8.5} fill={BRAND.slate}>
                {e.sublabel}
              </text>
            )}
            <text x={x} y={dateY} textAnchor={anchor} fontFamily={FONT_MONO} fontSize={8.5} fill={BRAND.mute} style={{ textTransform: "uppercase" }}>
              {shortDate(e.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
