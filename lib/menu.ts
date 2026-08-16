// The whole machine, in one list.
//
// This is the only place the console's shape is written down. The flush menu
// renders it, the tab bar picks its four out of it, the desktop nav picks its
// handful, and the local model reads it to answer "what can this thing do".
// Add a page here and every one of those follows; add it in four places and
// three of them drift.
//
// Framework-free on purpose: node tests and the model's context builder both
// import it, and neither wants React.

export type MenuArea =
  | "content"
  | "website"
  | "linkedin"
  | "automation"
  | "sales"
  | "delivery"
  | "team";

export interface MenuItem {
  href: string;
  label: string;
  /** One line, plain words, on what the page is for. Shown in the menu. */
  hint: string;
  /** Named icon from components/icons.tsx. Resolved there, not here. */
  icon: string;
}

export interface MenuSection {
  id: MenuArea;
  /** The channel, as a founder would say it out loud. */
  label: string;
  /** What this whole channel is, for the section header. */
  blurb: string;
  /**
   * The section's slot in the desktop header, when it earns one.
   *
   * Named rather than taken as the first item: Automation's pages live inside
   * Campaigns and Settings, so its first item shares a path with LinkedIn and
   * would light both up. A section with no `nav` simply is not in the bar, and
   * a header is not a sitemap — the Menu button holds the rest.
   */
  nav?: { label: string; href: string };
  items: MenuItem[];
}

export const MENU: MenuSection[] = [
  {
    id: "content",
    label: "Content",
    nav: { label: "Console", href: "/" },
    blurb: "What gets written, and everything that has been written.",
    items: [
      {
        href: "/",
        label: "Console",
        hint: "The dashboard. Press a button, get a post.",
        icon: "IconGrid",
      },
      {
        href: "/library",
        label: "Library",
        hint: "Every draft ever made, with how each one performed.",
        icon: "IconLayers",
      },
      {
        href: "/radar",
        label: "Radar",
        hint: "A live sweep of the sources, ranked, before anything is written.",
        icon: "IconSearch",
      },
      {
        href: "/playbook",
        label: "Playbook",
        hint: "How Stride sounds and looks. The voice gate, in full.",
        icon: "IconLineageDoc",
      },
    ],
  },
  {
    id: "website",
    label: "Website",
    nav: { label: "Website", href: "/seo" },
    blurb: "stride-ai.nl: what it ranks for, what it publishes, what needs fixing.",
    items: [
      {
        href: "/seo",
        label: "Search",
        hint: "Page scores, keywords and where the site stands.",
        icon: "IconTrend",
      },
      {
        href: "/seo?tab=drafts",
        label: "Blogs",
        hint: "Articles written for the site, waiting to be published.",
        icon: "IconLineageDoc",
      },
      {
        href: "/seo?tab=changes",
        label: "Review",
        hint: "Titles and metas rewritten by the sweep, for a person to approve.",
        icon: "IconReview",
      },
      {
        href: "/seo?tab=keywords",
        label: "Keywords",
        hint: "Terms worth owning, and the ones nobody has claimed.",
        icon: "IconTarget",
      },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    nav: { label: "LinkedIn", href: "/campaigns" },
    blurb: "The outbound channel: who gets approached, and in whose words.",
    items: [
      {
        href: "/campaigns",
        label: "Campaigns",
        hint: "What Linked Helper is running, and the switch to start or stop it.",
        icon: "IconPipeline",
      },
      {
        href: "/outreach",
        label: "Outreach",
        hint: "The connection notes and messages, held to the same voice gate.",
        icon: "IconWorkflow",
      },
      {
        href: "/outreach#drafts",
        label: "AI drafts",
        hint: "Every message the machine wrote, checked before it can send.",
        icon: "IconSpark",
      },
      {
        href: "/outreach#replies",
        label: "Replies",
        hint: "Somebody answered. This is where that lands.",
        icon: "IconEscalate",
      },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    blurb: "The machine room. Linked Helper, the bridge, and what feeds them.",
    items: [
      {
        href: "/campaigns#runner",
        label: "The runner",
        hint: "Start and stop the LinkedIn session that does the sending.",
        icon: "IconRuntime",
      },
      {
        href: "/settings#health",
        label: "Channel health",
        hint: "Is the bridge up, is Linked Helper reachable, how long the licence has.",
        icon: "IconConfidence",
      },
      {
        href: "/settings#webhook",
        label: "Webhook",
        hint: "The address campaigns post replies back to.",
        icon: "IconIntegration",
      },
      {
        href: "/settings",
        label: "Sources",
        hint: "The feeds the radar sweeps, and the machine's other settings.",
        icon: "IconData",
      },
      {
        href: "/settings#whatsapp",
        label: "WhatsApp",
        hint: "Chat with the console from a phone; draft-ready pings land there too.",
        icon: "IconEscalate",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    nav: { label: "Sales", href: "/clients" },
    blurb: "Who we are talking to, what we owe them, and when.",
    items: [
      {
        href: "/clients",
        label: "Clients and leads",
        hint: "Everyone in play, by stage, with the next step on each.",
        icon: "IconTeam",
      },
      {
        href: "/salesnav",
        label: "Email sequencer",
        hint: "Multi step email that sends itself, and the switch that stops it.",
        icon: "IconDeploy",
      },
      {
        href: "/calendar",
        label: "Calendar",
        hint: "Follow-ups, events and deadlines on one grid.",
        icon: "IconTime",
      },
      {
        href: "/events",
        label: "Events",
        hint: "The 1 Min AI Pitch nights, the checklist, and who signed up.",
        icon: "IconBolt",
      },
      {
        href: "/scout",
        label: "Event scout",
        hint: "Upcoming AI and retail events, scored on one rubric for best fit.",
        icon: "IconTarget",
      },
      {
        href: "/invoices",
        label: "Invoices",
        hint: "Client invoices in the approved template, numbered and tracked.",
        icon: "IconLineageDoc",
      },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    nav: { label: "Delivery", href: "/workspaces" },
    blurb: "Client work on this machine: the files, the repos, and what changed.",
    items: [
      {
        href: "/workspaces",
        label: "Workspaces",
        hint: "Every client's project files, and the machine that works on them.",
        icon: "IconIntegration",
      },
      {
        href: "/build",
        label: "Build",
        hint: "The building area: live Claude sessions, deliverables, prototypes.",
        icon: "IconRuntime",
      },
      {
        href: "/blueprints",
        label: "Blueprints",
        hint: "Reusable agents and workflows from past client work. Copy for the next one.",
        icon: "IconLayers",
      },
      {
        href: "/lab",
        label: "The lab",
        hint: "Throwaway virtual machines for experiments. Break things in here.",
        icon: "IconGuardrail",
      },
      {
        href: "/graph",
        label: "The graph",
        hint: "Every codebase and every session that worked on one, in one map.",
        icon: "IconBranch",
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    nav: { label: "Team", href: "/notes" },
    blurb: "The two of you, and the thing that knows where everything is.",
    items: [
      {
        href: "/today",
        label: "Today",
        hint: "Every commit, sweep, article and run since midnight. Read only.",
        icon: "IconTime",
      },
      {
        href: "/ask",
        label: "Ask Stride",
        hint: "A local model that can answer anything about this console.",
        icon: "IconAskStride",
      },
      {
        href: "/brain",
        label: "Brain",
        hint: "What the machine remembers: lessons from sessions, runs and the pipeline.",
        icon: "IconSpark",
      },
      {
        href: "/notes",
        label: "Notes",
        hint: "Shared board. Ideas, what to build, what is being built.",
        icon: "IconBranch",
      },
      {
        href: "/settings",
        label: "Settings",
        hint: "Notifications, the machine room, signing out.",
        icon: "IconTuneLoop",
      },
    ],
  },
];

/** The desktop header's slots, in order. Sections without a nav sit it out. */
export const NAV = MENU.flatMap((s) => (s.nav ? [s.nav] : []));

/**
 * One glyph per section, used by both the side rail and the ⌘K sheet's map
 * view, so a department reads as the same shape wherever the console shows
 * it. Every name here is one of icons.tsx's library-traced set — the icon
 * library has no bespoke "department" glyphs of its own, so each section
 * borrows the library icon nearest its meaning rather than inventing a
 * shape the library never drew. Icon *names* rather than components, since
 * this file stays framework-free.
 */
export const AREA_ICON: Record<MenuArea, string> = {
  content: "IconLayers",
  website: "IconTrend",
  linkedin: "IconPipeline",
  automation: "IconRuntime",
  sales: "IconTarget",
  delivery: "IconDeploy",
  team: "IconTeam",
};

/** Clients folds in beside Sales rather than being a MenuArea of its own. */
export const CLIENTS_ICON = "IconApproved";

/**
 * Which item a path is currently on. Hashes and queries are stripped, so
 * /seo?tab=drafts and /seo both light up the Website section — the section is
 * what the menu highlights, and pretending otherwise would light up nothing.
 */
export function sectionFor(pathname: string): MenuArea | undefined {
  const path = pathname.split(/[?#]/)[0];
  let best: { area: MenuArea; length: number } | undefined;
  for (const section of MENU) {
    for (const item of section.items) {
      const base = item.href.split(/[?#]/)[0];
      if (base === "/") continue;
      if (path === base || path.startsWith(`${base}/`)) {
        // Longest match wins, so /seo/foo never resolves to a shorter sibling.
        if (!best || base.length > best.length) {
          best = { area: section.id, length: base.length };
        }
      }
    }
  }
  if (best) return best.area;
  if (path === "/" || path.startsWith("/drafts")) return "content";
  return undefined;
}

// ---------- destination matching: free text -> a real page ----------
//
// The one place a founder's words become a URL. Voice navigation and the
// palette's search both want "given this text, which page did they mean" —
// this is that function, kept framework-free so nothing outside a browser
// tab can call it wrong, and kept a single ranked scorer so the answer to
// "which page matches 'invoic'" is the same everywhere it is asked.

export interface DestinationMatch {
  href: string;
  label: string;
  score: number;
}

/** Do the query's characters appear in order? "slnv" finds "Email sequencer". */
function subsequenceMatch(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

/** Every menu item, ranked against free text. Empty query, empty result. */
export function matchDestinations(query: string, limit = 5): DestinationMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: DestinationMatch[] = [];
  for (const section of MENU) {
    const sec = section.label.toLowerCase();
    for (const item of section.items) {
      const label = item.label.toLowerCase();
      const hint = item.hint.toLowerCase();
      let score: number | null = null;
      if (label === q) score = 120;
      else if (label.startsWith(q)) score = 100;
      else if (label.includes(q)) score = 80;
      // The reverse of the line above: "open the blueprints" contains the
      // label "blueprints" with filler words around it, which a transcribed
      // voice command does constantly and a typed search almost never does.
      else if (q.length > label.length && q.includes(label)) score = 75;
      else if (subsequenceMatch(label, q)) score = 60;
      else if (sec.startsWith(q) || sec.includes(q)) score = 50;
      else if (hint.includes(q)) score = 40;
      else if (subsequenceMatch(`${sec} ${hint}`, q)) score = 15;
      if (score !== null) hits.push({ href: item.href, label: item.label, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The single best match, or none at all below a confidence floor. */
export function matchDestination(query: string, floor = 40): DestinationMatch | undefined {
  const top = matchDestinations(query, 1)[0];
  return top && top.score >= floor ? top : undefined;
}
