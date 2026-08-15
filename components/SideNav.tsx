"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AREA_ICON, CLIENTS_ICON, MENU, sectionFor, type MenuArea } from "@/lib/menu";
import { iconByName, IconChevron } from "@/components/icons";
import { Mark } from "@/components/Ramp";

/**
 * The console down the left edge, folded.
 *
 * Eight doors, not thirty-five: the rail shows section names and opens one
 * at a time on click, because a founder scanning for "where do invoices
 * live" reads eight words faster than a wall. The section you are in opens
 * itself, everything else stays shut, and Clients is a section of its own —
 * one door per relationship, Durabo first among them.
 *
 * Phones keep the tab bar, laptops the header; this exists at xl. The menu
 * sheet (⌘K) stays for search and the tour.
 */

/** Chromeless routes, plus print views where a rail would shift the sheet. */
export function railHidden(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/pitch" ||
    pathname.endsWith("/print")
  );
}

export interface RailClient {
  id: string;
  label: string;
}

/** The Clients fold sits here in the reading order, at the founders' ask. */
const CLIENTS_AFTER: MenuArea = "sales";

export function SideNav({ clients = [] }: { clients?: RailClient[] }) {
  const pathname = usePathname();
  const current = sectionFor(pathname);
  const onClientPage = /^\/clients\/[^/]+/.test(pathname);

  // The fold you are in opens itself; the rest is one click away. Adjusted
  // during render on route change (the tab bar's own pattern) so following
  // a link into another section opens that section's fold without an effect.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set([onClientPage ? "clients" : (current ?? "content")]),
  );
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    const next = new Set(open);
    next.add(onClientPage ? "clients" : (current ?? "content"));
    setOpen(next);
  }

  if (railHidden(pathname)) return null;

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  const fold = (options: {
    id: string;
    label: string;
    icon: string;
    active: boolean;
    children: React.ReactNode;
  }) => {
    const isOpen = open.has(options.id);
    const SectionIcon = iconByName(options.icon);
    return (
      <div key={options.id}>
        <button
          type="button"
          onClick={() => toggle(options.id)}
          aria-expanded={isOpen}
          className={`pressable flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-semibold ${
            options.active ? "text-ink" : "text-slate hover:text-ink"
          }`}
        >
          <SectionIcon size={17} className={`shrink-0 ${options.active ? "text-indigo" : "text-mute"}`} />
          <span className="flex-1 text-left">{options.label}</span>
          <IconChevron
            size={13}
            className={`shrink-0 text-mute transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          />
        </button>
        {isOpen && <ul className="mb-1 mt-0.5 space-y-px pl-3">{options.children}</ul>}
      </div>
    );
  };

  const itemRow = (href: string, label: string, icon: string, hint?: string) => {
    const base = href.split(/[?#]/)[0];
    const here =
      base === "/"
        ? pathname === "/" || pathname.startsWith("/drafts")
        : pathname === base || pathname.startsWith(`${base}/`);
    const Icon = iconByName(icon);
    return (
      <li key={href + label}>
        <Link
          href={href}
          title={hint}
          className={`flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-semibold ${
            here ? "bg-indigo-tint/70 text-indigo" : "text-slate hover:bg-white hover:text-ink"
          }`}
        >
          <Icon size={15} className={`shrink-0 ${here ? "text-indigo" : "text-mute"}`} />
          <span className="truncate">{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside
      aria-label="Console sections"
      className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col overflow-y-auto border-r border-line bg-paper pb-6 pt-[calc(env(safe-area-inset-top)+16px)] xl:flex"
    >
      <Link href="/" className="pressable mx-5 flex items-center gap-2.5 text-ink">
        <Mark size={22} className="text-indigo" />
        <span className="text-[15px] font-bold tracking-tight">Stride</span>
      </Link>

      <nav className="mt-5 flex flex-1 flex-col gap-0.5 px-3">
        {MENU.map((section) => (
          <span key={section.id} className="contents">
            {fold({
              id: section.id,
              label: section.label,
              icon: AREA_ICON[section.id],
              active: current === section.id && !onClientPage,
              children: section.items.map((i) => itemRow(i.href, i.label, i.icon, i.hint)),
            })}
            {section.id === CLIENTS_AFTER &&
              clients.length > 0 &&
              fold({
                id: "clients",
                label: "Clients",
                icon: CLIENTS_ICON,
                active: onClientPage,
                children: clients.map((c) =>
                  itemRow(`/clients/${c.id}`, c.label, "IconTeam", `Everything for ${c.label}, one page.`),
                ),
              })}
          </span>
        ))}
      </nav>

      <p className="eyebrow mx-5 mt-6 text-[9px] text-mute">⌘K searches everything</p>
    </aside>
  );
}

/**
 * The rail's other half: pads the page out of its way, and only when the rail
 * is actually there. Client-side because both halves hang off the pathname.
 */
export function RailOffset({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className={railHidden(pathname) ? "" : "xl:pl-56"}>{children}</div>;
}
