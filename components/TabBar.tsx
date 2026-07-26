"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Phone-width navigation: an app-style tab bar in thumb reach, because the
 * console is used as an app on a phone far more than as a site on a desktop.
 * Hidden at sm and up, where the header nav takes over.
 */

const TABS = [
  { href: "/", label: "Console", icon: ConsoleIcon },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/radar", label: "Radar", icon: RadarIcon },
  { href: "/events", label: "Events", icon: EventsIcon },
] as const;

const MORE = [
  { href: "/campaigns", label: "Campaigns", hint: "What Linked Helper is running on LinkedIn." },
  { href: "/playbook", label: "Playbook", hint: "How Stride sounds — voice, formulas, the look." },
  { href: "/settings", label: "Settings", hint: "Sources, notifications, the machine room." },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/drafts");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  // Route change closes the sheet — state adjusted during render, no effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMoreOpen(false);
  }

  // The tab bar is founder chrome. Login and the public signup page go bare.
  if (pathname === "/login" || pathname === "/pitch") return null;

  return (
    <>
      {moreOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-30 bg-ink/30 sm:hidden"
        />
      ) : null}

      <div
        className={`fixed inset-x-0 z-40 px-4 transition-all duration-200 sm:hidden ${
          moreOpen
            ? "bottom-[calc(76px+env(safe-area-inset-bottom))] opacity-100"
            : "pointer-events-none bottom-[calc(56px+env(safe-area-inset-bottom))] opacity-0"
        }`}
      >
        <div className="mx-auto max-w-md overflow-hidden rounded-card border border-line bg-white shadow-lg">
          {MORE.map((m, i) => (
            <Link
              key={m.href}
              href={m.href}
              className={`block px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""} ${
                isActive(pathname, m.href) ? "bg-indigo-tint" : ""
              }`}
            >
              <span className="block text-sm font-semibold text-ink">{m.label}</span>
              <span className="block text-xs text-slate">{m.hint}</span>
            </Link>
          ))}
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 transition-colors ${
                  active ? "text-indigo" : "text-slate"
                }`}
              >
                <Icon />
                <span className="eyebrow">{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 transition-colors ${
              moreActive || moreOpen ? "text-indigo" : "text-slate"
            }`}
          >
            <MoreIcon />
            <span className="eyebrow">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ConsoleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M5 4h4v16H5zM11 4h4v16h-4z" />
      <path d="M16.5 5l3.5 1-3.8 14-3.4-1z" />
    </svg>
  );
}

function RadarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l5.5-5.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="4" y="5" width="16" height="15" rx="1.5" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="6" cy="12" r="0.8" fill="currentColor" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
      <circle cx="18" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}
