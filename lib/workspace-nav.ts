/** Presentation-only navigation. Existing URLs and the voice destination registry stay stable. */
export const WORKSPACE_GROUPS = [
  {
    label: "Workspace",
    items: [
      { label: "Home", href: "/", icon: "IconGrid" },
      { label: "Clients", href: "/clients", icon: "IconTeam" },
      { label: "Calendar", href: "/calendar", icon: "IconTime" },
      { label: "Notes", href: "/notes", icon: "IconBranch" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Projects", href: "/workspaces", icon: "IconIntegration" },
      { label: "Build", href: "/build", icon: "IconRuntime" },
      { label: "Blueprints", href: "/blueprints", icon: "IconLayers" },
    ],
  },
  {
    label: "Growth",
    items: [
      { label: "Content", href: "/library", icon: "IconLineageDoc" },
      { label: "Campaigns", href: "/campaigns", icon: "IconPipeline" },
      { label: "Outreach", href: "/outreach", icon: "IconEscalate" },
      { label: "Website", href: "/seo", icon: "IconTrend" },
      { label: "Events", href: "/events", icon: "IconBolt" },
    ],
  },
  {
    label: "Finance & knowledge",
    items: [
      { label: "Invoices", href: "/invoices", icon: "IconLineageDoc" },
      { label: "Knowledge", href: "/brain", icon: "IconSpark" },
    ],
  },
] as const;

export function isWorkspaceRoute(path: string) {
  return (
    path !== "/login" &&
    path !== "/pitch" &&
    !path.startsWith("/portal/") &&
    !path.endsWith("/print") &&
    !path.endsWith("/one-pager")
  );
}
export function routeIsActive(path: string, href: string) {
  return href === "/"
    ? path === "/"
    : path === href || path.startsWith(`${href}/`);
}
export function workspaceLocation(path: string): {
  label: string;
  area: string;
} {
  const match = WORKSPACE_GROUPS.flatMap((g) =>
    g.items.map((i) => ({ ...i, area: g.label })),
  )
    .filter((i) => routeIsActive(path, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match;
  const extra: Record<string, string> = {
    settings: "Settings",
    ask: "Ask Stride",
    radar: "News radar",
    today: "Activity",
    lab: "Lab",
    graph: "Project graph",
    playbook: "Brand playbook",
    salesnav: "Email sequencer",
    scout: "Event scout",
    durabo: "Durabo",
    drafts: "Draft review",
  };
  return {
    label: extra[path.split("/")[1]] ?? "Workspace",
    area: "Stride Console",
  };
}

/** Destination names outrank explanatory copy, so exact searches stay predictable. */
export function commandScore(
  value: string,
  search: string,
  keywords: string[] = [],
): number {
  const label = value.toLowerCase();
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  if (label === q) return 1;
  if (label.startsWith(q)) return 0.9;
  if (label.includes(q)) return 0.75;
  if (keywords.some((k) => k.toLowerCase().includes(q))) return 0.4;
  let i = 0;
  for (const char of label) {
    if (char === q[i]) i++;
  }
  return i === q.length ? 0.15 : 0;
}
