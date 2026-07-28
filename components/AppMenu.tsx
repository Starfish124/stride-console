"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { MENU, sectionFor } from "@/lib/menu";
import { iconByName } from "@/components/icons";
import { Mark } from "@/components/Ramp";

/**
 * The whole console, on one sheet.
 *
 * It opens flush: the sheet covers the screen rather than hanging off an edge,
 * because this is not a nav dropdown, it is the answer to "what does this
 * thing do" — asked by a founder who forgot, and by a client being shown
 * around. Both of those want everything visible at once, not a tree to expand.
 *
 * The behaviours that make it read as native rather than as a div that
 * appeared: it scales up from just under full size, the sections stagger in
 * behind it, the page underneath is inert while it is up, Escape closes it,
 * and focus goes to the filter so a keyboard can drive the whole thing.
 */

/**
 * One sheet, two triggers: the pill in the header and the last slot in the
 * phone tab bar. They sit in different trees, so the open state is shared
 * through context rather than duplicated — two sheets in the DOM would be two
 * copies of every route, and only one of them would ever be right.
 */
const MenuContext = createContext<(open: boolean) => void>(() => {});

/** The header pill. */
export function MenuButton() {
  const setOpen = useContext(MenuContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Everything in the console"
      className="pressable flex items-center gap-2 rounded-full border border-line bg-white/80 px-3 py-1.5 text-slate hover:border-indigo/30 hover:text-indigo"
    >
      {/* Three sheared bars: the mark's own angle, used as a menu glyph. */}
      <span aria-hidden className="flex w-4 flex-col gap-[3px]">
        <span className="slant-rule h-[2.5px] w-full" />
        <span className="slant-rule h-[2.5px] w-full opacity-60" />
        <span className="slant-rule h-[2.5px] w-full opacity-35" />
      </span>
      <span className="eyebrow text-[10px]">Menu</span>
    </button>
  );
}

/** Whatever the tab bar wants to draw, wired to the same sheet. */
export function MenuTrigger({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  const setOpen = useContext(MenuContext);
  return (
    <button type="button" onClick={() => setOpen(true)} aria-label={label} className={className}>
      {children}
    </button>
  );
}

export function AppMenu({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const current = sectionFor(pathname);

  // Route change closes the sheet, adjusted during render rather than in an
  // effect — the same pattern the tab bar already uses.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    // The sheet is the only thing on screen, so the page behind it must not
    // scroll under it, and Escape has to work from anywhere including the
    // filter field.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Focus after the open transition starts, or iOS Safari scrolls the sheet
    // to meet the keyboard mid-animation.
    const t = setTimeout(() => inputRef.current?.focus(), 260);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  // Founder chrome only. The public signup page and login go bare — but the
  // provider still has to wrap the tree, or every trigger below it throws.
  if (pathname === "/login" || pathname === "/pitch") {
    return <MenuContext.Provider value={setOpen}>{children}</MenuContext.Provider>;
  }

  const q = query.trim().toLowerCase();
  const sections = MENU.map((section) => ({
    ...section,
    items: q
      ? section.items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.hint.toLowerCase().includes(q) ||
            section.label.toLowerCase().includes(q),
        )
      : section.items,
  })).filter((s) => s.items.length > 0);

  return (
    <MenuContext.Provider value={setOpen}>
      {children}

      {/* The sheet. Kept mounted so opening it is a transition, not a mount. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Everything in the console"
        className={`fixed inset-0 z-50 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`absolute inset-0 overflow-y-auto bg-paper/95 backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? "scale-100" : "scale-[1.03]"
          }`}
        >
          <div className="mx-auto max-w-5xl px-6 pb-24 pt-[calc(env(safe-area-inset-top)+18px)]">
            <div className="flex items-center justify-between gap-4">
              <Link
                href="/"
                className="pressable flex items-center gap-2.5 text-ink"
                onClick={() => setOpen(false)}
              >
                <Mark size={24} className="text-indigo" />
                <span className="eyebrow text-slate">Everything</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the menu"
                className="pressable flex size-9 items-center justify-center rounded-full border border-line bg-white text-slate hover:text-ink"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <h2 className="title-large mt-6 text-ink">
              The whole <span className="accent">machine</span>.
            </h2>
            <p className="mt-2 max-w-md text-slate">
              Sales, marketing and the automations that run them. Every channel
              in one place, and nothing goes out without one of you.
            </p>

            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Find anything"
              aria-label="Filter the menu"
              className="mt-6 w-full rounded-input border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-mute focus:border-indigo focus:outline-none"
            />

            {sections.length === 0 && (
              <p className="mt-10 text-slate">
                Nothing here matches that. Clear the box to see everything.
              </p>
            )}

            <div className="mt-10 flex flex-col gap-11">
              {sections.map((section, si) => (
                <section
                  key={section.id}
                  // Sections arrive one after another rather than together, so
                  // the sheet reads as unfolding instead of blinking on.
                  style={{
                    transitionDelay: open ? `${60 + si * 45}ms` : "0ms",
                  }}
                  className={`transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                  }`}
                >
                  <div className="mb-4 flex items-baseline gap-3">
                    <h3 className="display text-[22px] text-ink">{section.label}</h3>
                    {current === section.id && (
                      <span className="eyebrow text-indigo">You are here</span>
                    )}
                  </div>
                  <p className="-mt-2 mb-4 max-w-lg text-[14px] text-slate">
                    {section.blurb}
                  </p>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {section.items.map((item) => {
                      const Icon = iconByName(item.icon);
                      const here = pathname === item.href.split(/[?#]/)[0];
                      return (
                        <Link
                          key={item.href + item.label}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`card-lift card-glass flex items-start gap-3.5 rounded-card border px-4 py-3.5 ${
                            here
                              ? "border-indigo/30 bg-indigo-tint/50"
                              : "border-line bg-white"
                          }`}
                        >
                          <Icon
                            size={22}
                            className={`mt-0.5 shrink-0 ${here ? "text-indigo" : "text-slate"}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold leading-snug text-ink">
                              {item.label}
                            </span>
                            <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                              {item.hint}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MenuContext.Provider>
  );
}
