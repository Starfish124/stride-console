// The Stride interface icon set, taken from the icon library.
//
// 24px grid, 1.7px stroke, round caps and joins. The library calls itself the
// single source of truth and says it supersedes the strip in the brand book,
// so these are traced from it rather than drawn again by hand.
//
// Every glyph inherits currentColor, so colour is the caller's business.

interface IconProps {
  /** Pixel size. The grid is 24, so anything else scales the same drawing. */
  size?: number;
  className?: string;
  /** Heavier stroke for a selected state, the way SF Symbols thickens. */
  strong?: boolean;
}

/**
 * The library ships the set at 20 · 24 · 32 · 48px and is explicit about the
 * direction: thicken the stroke as the icon shrinks, never the reverse. A flat
 * 1.7 is right at 32 and too thin at 20, where the glyph goes wiry.
 */
function strokeFor(size: number): number {
  if (size <= 20) return 2;
  if (size <= 28) return 1.8;
  if (size <= 40) return 1.7;
  return 1.6;
}

function frame({ size = 24, className, strong }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    // A selected tab thickens the way SF Symbols does, from whatever the
    // size-appropriate weight already is.
    strokeWidth: strokeFor(size) + (strong ? 0.5 : 0),
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export function IconApproved(props: IconProps) {
  return <svg {...frame(props)}><circle cx="12" cy="12" r="8.8" /><path d="M8 12.2l2.8 2.8 5.2-5.8" /></svg>;
}

export function IconAskStride(props: IconProps) {
  return <svg {...frame(props)}><path d="M20.4 14.4a2.4 2.4 0 0 1-2.4 2.4H9l-4.6 3.6V6a2.4 2.4 0 0 1 2.4-2.4H18a2.4 2.4 0 0 1 2.4 2.4z" /><path d="M9 10.2h6.4" /></svg>;
}

export function IconBars(props: IconProps) {
  return <svg {...frame(props)}><path d="M4.4 20.4V13m5.2 7.4V8.2m5.2 12.2v-5.6m5.2 5.6V4.2" /></svg>;
}

export function IconBolt(props: IconProps) {
  return <svg {...frame(props)}><path d="M13.8 2.4L5.2 13.6h5.4L9.4 21.6 18 10.4h-5.5z" /></svg>;
}

export function IconBranch(props: IconProps) {
  return <svg {...frame(props)}><circle cx="6.6" cy="5.4" r="2.2" /><circle cx="17.4" cy="18.6" r="2.2" /><circle cx="6.6" cy="18.6" r="2.2" /><path d="M6.6 7.6v8.8M8.8 18.6h6.4M6.6 12h6.2a4.4 4.4 0 0 0 4.4-4.4V7" /></svg>;
}

export function IconConfidence(props: IconProps) {
  return <svg {...frame(props)}><path d="M3.2 17.8a8.8 8.8 0 1 1 17.6 0" /><path d="M12 17.8l4.6-5.6" /><circle cx="12" cy="18" r="1.6" /></svg>;
}

export function IconData(props: IconProps) {
  return <svg {...frame(props)}><path d="M12 3.2c4.3 0 7.4 1.1 7.4 2.4S16.3 8 12 8 4.6 6.9 4.6 5.6 7.7 3.2 12 3.2z" /><path d="M4.6 5.6v12.8c0 1.3 3.1 2.4 7.4 2.4s7.4-1.1 7.4-2.4V5.6" /><path d="M4.6 12c0 1.3 3.1 2.4 7.4 2.4s7.4-1.1 7.4-2.4" /></svg>;
}

export function IconDeploy(props: IconProps) {
  return <svg {...frame(props)}><path d="M4.4 15v3.6a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8V15" /><path d="M12 3.4v11.4M8 7.4L12 3.4l4 4" /></svg>;
}

export function IconEscalate(props: IconProps) {
  return <svg {...frame(props)}><path d="M12 3.4l9.2 16.2H2.8z" /><path d="M12 9.4v4.6M12 17h.01" /></svg>;
}

export function IconFilter(props: IconProps) {
  return <svg {...frame(props)}><path d="M3.4 4.8h17.2l-6.6 7.8v7l-4-2.6v-4.4z" /></svg>;
}

export function IconGate(props: IconProps) {
  return <svg {...frame(props)}><path d="M4.6 4.4v15.2M19.4 4.4v15.2M4.6 8.6h14.8M12 8.6v4.2" /></svg>;
}

export function IconGrid(props: IconProps) {
  return <svg {...frame(props)}><path d="M6.6 3.4h5l-1.8 6.4h-5zM14.4 3.4h5l-1.8 6.4h-5zM4.6 14.2h5l-1.8 6.4h-5zM12.4 14.2h5l-1.8 6.4h-5z" /></svg>;
}

export function IconGuardrail(props: IconProps) {
  return <svg {...frame(props)}><path d="M12 2.6l7.6 2.8v6c0 4.4-3 7.7-7.6 9.5-4.6-1.8-7.6-5.1-7.6-9.5v-6z" /><path d="M8.6 11.8l2.6 2.6 4.4-5" /></svg>;
}

export function IconIntegration(props: IconProps) {
  return <svg {...frame(props)}><path d="M13.4 4.6l-2.8 4.8" /><path d="M15.8 3.2h3.4a2.6 2.6 0 0 1 2.2 4l-1.8 3M8.2 20.8H4.8a2.6 2.6 0 0 1-2.2-4l1.8-3" /><path d="M10.6 19.4l2.8-4.8" /><path d="M7.4 9.6l9.2 4.8" /></svg>;
}

export function IconKey(props: IconProps) {
  return <svg {...frame(props)}><circle cx="8" cy="8" r="4.4" /><path d="M11.2 11.2l9 9M17.2 17.2l-2 2M20 14.4l-2 2" /></svg>;
}

export function IconLayers(props: IconProps) {
  return <svg {...frame(props)}><path d="M10.8 2.8h9.4l-3.2 5.2H7.6z" /><path d="M10.8 9.4h9.4l-3.2 5.2H7.6z" /><path d="M10.8 16h9.4l-3.2 5.2H7.6z" /></svg>;
}

export function IconLineageDoc(props: IconProps) {
  return <svg {...frame(props)}><path d="M6.2 2.8h7.6l4.4 4.4v14H6.2z" /><path d="M13.8 2.8v4.4h4.4M9.4 12.4h5.2M9.4 16.4h5.2" /></svg>;
}

export function IconLock(props: IconProps) {
  return <svg {...frame(props)}><rect x="4.4" y="10.4" width="15.2" height="10.4" rx="2.4" /><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" /><path d="M12 14.6v2" /></svg>;
}

export function IconPipeline(props: IconProps) {
  return <svg {...frame(props)}><path d="M2.6 12h18.4M17.6 8.4l3.4 3.6-3.4 3.6" /><circle cx="7.6" cy="12" r="1.9" /><circle cx="13" cy="12" r="1.9" /></svg>;
}

export function IconResidency(props: IconProps) {
  return <svg {...frame(props)}><circle cx="12" cy="12" r="8.8" /><path d="M3.4 12h17.2" /><path d="M12 3.2c2.4 2.4 3.6 5.4 3.6 8.8s-1.2 6.4-3.6 8.8c-2.4-2.4-3.6-5.4-3.6-8.8S9.6 5.6 12 3.2z" /></svg>;
}

export function IconReview(props: IconProps) {
  return <svg {...frame(props)}><path d="M2.4 12S5.8 5.8 12 5.8 21.6 12 21.6 12 18.2 18.2 12 18.2 2.4 12 2.4 12z" /><circle cx="12" cy="12" r="2.8" /></svg>;
}

export function IconRuntime(props: IconProps) {
  return <svg {...frame(props)}><rect x="7" y="7" width="10" height="10" rx="2.2" /><path d="M11 3.2v3.8M13 3.2v3.8M11 17v3.8M13 17v3.8M3.2 11H7M3.2 13H7M17 11h3.8M17 13h3.8" /></svg>;
}

export function IconSearch(props: IconProps) {
  return <svg {...frame(props)}><circle cx="10.6" cy="10.6" r="6.6" /><path d="M15.6 15.6l4.8 4.8" /></svg>;
}

export function IconSpark(props: IconProps) {
  return <svg {...frame(props)}><path d="M12 2.6l1.9 5.6 5.5 1.9-5.5 1.9L12 17.6l-1.9-5.6L4.6 10.1l5.5-1.9z" /><path d="M18.7 16.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>;
}

export function IconTarget(props: IconProps) {
  return <svg {...frame(props)}><circle cx="12" cy="12" r="8.8" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1" /></svg>;
}

export function IconTeam(props: IconProps) {
  return <svg {...frame(props)}><circle cx="9" cy="8.4" r="3.4" /><path d="M3.4 20c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6" /><path d="M15.6 5.4a3.4 3.4 0 0 1 0 6.4M17.2 14.9c2.1.7 3.4 2.6 3.4 5.1" /></svg>;
}

export function IconTime(props: IconProps) {
  return <svg {...frame(props)}><circle cx="12" cy="12" r="8.8" /><path d="M12 7v5.4l3.6 2.2" /></svg>;
}

export function IconTrend(props: IconProps) {
  return <svg {...frame(props)}><path d="M3.4 17l5.2-5.6 3.6 2.8 7.4-8" /><circle cx="19.6" cy="6.2" r="1.8" /><path d="M3.4 20.6h17.2" /></svg>;
}

export function IconTuneLoop(props: IconProps) {
  return <svg {...frame(props)}><path d="M20.4 12a8.4 8.4 0 0 1-14.7 5.6M3.6 12a8.4 8.4 0 0 1 14.7-5.6" /><path d="M3.6 7.2v4.9h4.9M20.4 16.8v-4.9h-4.9" /></svg>;
}

/**
 * The disclosure chevron.
 *
 * Not in the icon library, which has no navigational glyphs, so it is drawn to
 * the library's own spec rather than pulled from a second set: 24px grid,
 * 1.7px stroke, round caps, currentColor. A list row without one does not read
 * as somewhere you can go.
 */
export function IconChevron(props: IconProps) {
  return <svg {...frame(props)}><path d="M9.6 5.4l6.4 6.6-6.4 6.6" /></svg>;
}

export function IconWorkflow(props: IconProps) {
  return <svg {...frame(props)}><circle cx="5" cy="6" r="2.4" /><circle cx="19" cy="6" r="2.4" /><circle cx="12" cy="18.4" r="2.4" /><path d="M7.4 6h9.2M6.3 8.2l4.4 8M17.7 8.2l-4.4 8" /></svg>;
}

/**
 * The section rail's own set: one glyph per channel, drawn to the library's
 * spec rather than picked from the general set, because a fold header names
 * a whole department and deserves a mark of its own instead of borrowing
 * whatever icon a random item inside it happened to use.
 */

/** Content: the pen, mid-line. */
export function IconSectionContent(props: IconProps) {
  return <svg {...frame(props)}><path d="M4.4 19.6l1-4.4L15.8 4.8l3.4 3.4L8.8 18.6z" /><path d="M13.6 6.4l4 4" /><path d="M4.4 19.6l4.4-1" /></svg>;
}

/** Website: the browser chrome, not the globe — this is the site, not the geography. */
export function IconSectionWebsite(props: IconProps) {
  return <svg {...frame(props)}><rect x="3" y="4.6" width="18" height="14.8" rx="2.4" /><path d="M3 9h18" /><circle cx="6.2" cy="6.8" r=".9" /><circle cx="9" cy="6.8" r=".9" /></svg>;
}

/** LinkedIn: a message leaving the building. No trademark, just the shape of outbound. */
export function IconSectionLinkedIn(props: IconProps) {
  return <svg {...frame(props)}><rect x="3" y="5.4" width="14.4" height="10.4" rx="3" /><path d="M6.6 15.8v3.4l4.2-3.4" /><path d="M20.6 3.4v4.6h-4.6M20.6 3.4l-5.4 5.4" /></svg>;
}

/** Automation: the gear, hub and eight teeth. */
export function IconSectionAutomation(props: IconProps) {
  return <svg {...frame(props)}><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="7.4" /><path d="M12 2.4v2.4M12 19.2v2.4M21.6 12h-2.4M4.8 12H2.4M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" /></svg>;
}

/** Sales: the briefcase. */
export function IconSectionSales(props: IconProps) {
  return <svg {...frame(props)}><rect x="3" y="8.2" width="18" height="12" rx="2.2" /><path d="M8.6 8.2V6a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v2.2" /><path d="M3 13.4h18M10.6 13.4v1.8h2.8v-1.8" /></svg>;
}

/** Clients: the door. One per relationship, the way the rail now holds them. */
export function IconSectionClients(props: IconProps) {
  return <svg {...frame(props)}><rect x="5.4" y="2.6" width="12" height="18.8" rx="1.4" /><circle cx="14.4" cy="12" r=".9" /><path d="M2.6 21.4h18.8" /></svg>;
}

/** Delivery: the shipped box. */
export function IconSectionDelivery(props: IconProps) {
  return <svg {...frame(props)}><path d="M12 3.2l8.4 4.6v8.4L12 20.8 3.6 16.2V7.8z" /><path d="M3.6 7.8 12 12.4l8.4-4.6M12 12.4v8.4" /></svg>;
}

/**
 * Look a glyph up by name.
 *
 * lib/menu.ts is framework-free so node tests and the model's context builder
 * can import it, which means it can only name its icons as strings. This is
 * where a name becomes a drawing. Unknown names fall back rather than crash: a
 * menu row with the wrong glyph is a typo, a menu that throws is an outage.
 */
const BY_NAME: Record<string, (props: IconProps) => React.ReactElement> = {
  IconApproved, IconAskStride, IconBars, IconBolt, IconBranch, IconConfidence,
  IconData, IconDeploy, IconEscalate, IconFilter, IconGate, IconGrid,
  IconGuardrail, IconIntegration, IconKey, IconLayers, IconLineageDoc, IconLock,
  IconPipeline, IconResidency, IconReview, IconRuntime, IconSearch, IconSpark,
  IconTarget, IconTeam, IconTime, IconTrend, IconTuneLoop, IconWorkflow, IconChevron,
  IconSectionContent, IconSectionWebsite, IconSectionLinkedIn, IconSectionAutomation,
  IconSectionSales, IconSectionClients, IconSectionDelivery,
};

export function iconByName(name: string) {
  return BY_NAME[name] ?? IconGrid;
}

/**
 * Render a glyph by name.
 *
 * `const Icon = iconByName(x)` inside a component body creates a component
 * during render, which React's lint rule rightly objects to: the identity
 * changes every pass. This wrapper has one stable identity and does the lookup
 * internally, so callers can take an icon name as data without that cost.
 */
export function Glyph({ name, ...props }: IconProps & { name: string }) {
  // Called rather than rendered as <Icon />. Every glyph here is a plain
  // function of props with no state of its own, so invoking it returns the
  // same element JSX would have built — without declaring a fresh component
  // type on each render, which is the thing that would reset state if these
  // ever had any.
  return iconByName(name)(props);
}
