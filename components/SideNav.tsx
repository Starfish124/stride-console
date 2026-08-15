"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU, sectionFor, type MenuArea } from "@/lib/menu";
import { iconByName } from "@/components/icons";
import { Mark } from "@/components/Ramp";

/**
 * The whole console down the left edge, on screens wide enough to afford it.
 *
 * Phones keep the tab bar, laptops keep the header, but on a big display the
 * fastest navigation is the one that never goes away: every destination one
 * click from everywhere, current page lit, no sheet to open first. The menu
 * sheet (⌘K) stays for search and for the tour; this rail is for the two
 * people who already know the building and just want the doors visible.
 */

const AREA_TONE: Record<MenuArea, string> = {
  content: "text-indigo",
  website: "text-signal",
  linkedin: "text-violet",
  automation: "text-mute",
  sales: "text-amber",
  delivery: "text-lime",
  team: "text-slate",
};

/** Chromeless routes, plus print views where a rail would shift the sheet. */
export function railHidden(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/pitch" ||
    pathname.endsWith("/print")
  );
}

export function SideNav() {
  const pathname = usePathname();
  if (railHidden(pathname)) return null;
  const current = sectionFor(pathname);

  return (
    <aside
      aria-label="Console sections"
      className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col overflow-y-auto border-r border-line bg-paper pb-6 pt-[calc(env(safe-area-inset-top)+16px)] xl:flex"
    >
      <Link href="/" className="pressable mx-5 flex items-center gap-2.5 text-ink">
        <Mark size={22} className="text-indigo" />
        <span className="text-[15px] font-bold tracking-tight">Stride</span>
      </Link>

      <nav className="mt-6 flex flex-1 flex-col gap-5 px-3">
        {MENU.map((section) => (
          <div key={section.id}>
            <p className="mx-2 flex items-center gap-2">
              <span aria-hidden className={`slant-rule h-[2.5px] w-3.5 shrink-0 ${AREA_TONE[section.id]}`} />
              <span
                className={`eyebrow text-[9.5px] ${current === section.id ? "text-ink" : "text-mute"}`}
              >
                {section.label}
              </span>
            </p>
            <ul className="mt-1.5 space-y-px">
              {section.items.map((item) => {
                const base = item.href.split(/[?#]/)[0];
                const here =
                  base === "/"
                    ? pathname === "/" || pathname.startsWith("/drafts")
                    : pathname === base || pathname.startsWith(`${base}/`);
                const Icon = iconByName(item.icon);
                return (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      title={item.hint}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-semibold ${
                        here
                          ? "bg-indigo-tint/70 text-indigo"
                          : "text-slate hover:bg-white hover:text-ink"
                      }`}
                    >
                      <Icon size={15} className={`shrink-0 ${here ? "text-indigo" : "text-mute"}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
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
