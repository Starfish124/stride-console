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
  { href: "/campaigns", label: "Campaigns", icon: CampaignsIcon },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/radar", label: "Radar", icon: RadarIcon },
] as const;

const MORE = [
  { href: "/outreach", label: "Outreach", hint: "The words the campaigns send, and the replies." },
  { href: "/events", label: "Events", hint: "The 1 Min AI Pitch nights, and who signed up." },
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
      {/* Scrim: fades rather than snaps, so the sheet feels lifted not swapped. */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setMoreOpen(false)}
        className={`fixed inset-0 z-30 bg-ink/25 backdrop-blur-[2px] transition-opacity duration-300 sm:hidden ${
          moreOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* An action sheet: rises from behind the bar, grabber and all. */}
      <div
        className={`fixed inset-x-0 z-40 px-3 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:hidden ${
          moreOpen
            ? "bottom-[calc(74px+env(safe-area-inset-bottom))] translate-y-0 opacity-100"
            : "pointer-events-none bottom-[calc(58px+env(safe-area-inset-bottom))] translate-y-3 opacity-0"
        }`}
      >
        <div className="mx-auto max-w-md overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_1px_2px_rgba(16,17,22,0.05),0_24px_48px_-16px_rgba(16,17,22,0.28)]">
          <div className="flex justify-center pt-2.5">
            <span aria-hidden className="h-1 w-9 rounded-full bg-line" />
          </div>
          {MORE.map((m, i) => (
            <Link
              key={m.href}
              href={m.href}
              className={`block px-5 py-3.5 active:bg-paper ${i > 0 ? "border-t border-line" : ""} ${
                isActive(pathname, m.href) ? "bg-indigo-tint" : ""
              }`}
            >
              <span className="block text-[15px] font-semibold text-ink">{m.label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-slate">{m.hint}</span>
            </Link>
          ))}
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="material fixed inset-x-0 bottom-0 z-40 border-t border-line/80 pb-[env(safe-area-inset-bottom)] sm:hidden"
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
                className={`pressable flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 ${
                  active ? "text-indigo" : "text-slate"
                }`}
              >
                <Icon active={active} />
                <span className="text-[10px] font-semibold tracking-[0.01em]">{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`pressable flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 ${
              moreActive || moreOpen ? "text-indigo" : "text-slate"
            }`}
          >
            <MoreIcon active={moreActive || moreOpen} />
            <span className="text-[10px] font-semibold tracking-[0.01em]">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

/**
 * Tab icons follow the SF Symbols habit: outline when idle, weightier and
 * tinted when selected. The fill is faint on purpose — iOS signals the
 * current tab mostly through colour, and a solid glyph at 22px reads as a
 * different icon rather than the same one selected.
 */
type IconProps = { active?: boolean };

function glyph(active?: boolean) {
  return {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2 : 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
}

const wash = (active?: boolean) => (active ? "currentColor" : "none");

function ConsoleIcon({ active }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" {...glyph(active)}>
      <rect x="4" y="4" width="7" height="7" rx="1.4" fill={wash(active)} fillOpacity={0.14} />
      <rect x="13" y="4" width="7" height="7" rx="1.4" fill={wash(active)} fillOpacity={0.14} />
      <rect x="4" y="13" width="7" height="7" rx="1.4" fill={wash(active)} fillOpacity={0.14} />
      <rect x="13" y="13" width="7" height="7" rx="1.4" fill={wash(active)} fillOpacity={0.14} />
    </svg>
  );
}

function LibraryIcon({ active }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" {...glyph(active)}>
      <path d="M5 4h4v16H5zM11 4h4v16h-4z" fill={wash(active)} fillOpacity={0.14} />
      <path d="M16.5 5l3.5 1-3.8 14-3.4-1z" fill={wash(active)} fillOpacity={0.14} />
    </svg>
  );
}

function RadarIcon({ active }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" {...glyph(active)}>
      <circle cx="12" cy="12" r="8" fill={wash(active)} fillOpacity={0.1} />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l5.5-5.5" />
      <circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CampaignsIcon({ active }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" {...glyph(active)}>
      <path d="M4 9.5v5a1 1 0 0 0 1 1h3l6 4V4.5l-6 4H5a1 1 0 0 0-1 1Z" fill={wash(active)} fillOpacity={0.14} />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

function MoreIcon({ active }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" {...glyph(active)}>
      <circle cx="6" cy="12" r={active ? 1.5 : 1.1} fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r={active ? 1.5 : 1.1} fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r={active ? 1.5 : 1.1} fill="currentColor" stroke="none" />
    </svg>
  );
}
