"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MENU, sectionFor, type MenuArea, type MenuItem } from "@/lib/menu";
import { iconByName } from "@/components/icons";
import { Mark } from "@/components/Ramp";

/**
 * The whole console, on one sheet — part map, part command palette.
 *
 * It opens flush: the sheet covers the screen rather than hanging off an edge,
 * because this is not a nav dropdown, it is the answer to "what does this
 * thing do" — asked by a founder who forgot, and by a client being shown
 * around. Both of those want everything visible at once, not a tree to expand.
 *
 * Two modes share the sheet, the same split Linear and Raycast made standard:
 * browsing gets the map (seven bands, pills, a "jump back in" row fed by
 * frecency), searching gets the palette (fuzzy-ranked flat list, arrow keys,
 * Enter opens the top hit). ⌘K opens it from anywhere, because the fastest
 * navigation is the one that does not need the pointer at all.
 */

/**
 * One sheet, two triggers: the pill in the header and the last slot in the
 * phone tab bar. They sit in different trees, so the open state is shared
 * through context rather than duplicated — two sheets in the DOM would be two
 * copies of every route, and only one of them would ever be right.
 */
const MenuContext = createContext<(open: boolean) => void>(() => {});

/**
 * Each section's hue for the sheared tick in the map view. Wayfinding colour,
 * used nowhere else on the sheet: the eye learns "amber = Sales" and finds it
 * again without reading. All hues come from the icon library's palette.
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

// ---------- frecency: the console remembers where you actually go ----------

const FREC_KEY = "stride-nav-frecency";

type FrecMap = Record<string, { n: number; last: number }>;

function readFrec(): FrecMap {
  try {
    return JSON.parse(localStorage.getItem(FREC_KEY) ?? "{}") as FrecMap;
  } catch {
    return {};
  }
}

/**
 * Visits score by frequency decayed by recency (half-life one week), the same
 * blend browsers use for their address bars. A page you open every day beats
 * a page you opened twenty times in March.
 */
function frecencyScore(entry: { n: number; last: number }, now: number): number {
  const weeks = Math.max(0, now - entry.last) / (7 * 24 * 3600 * 1000);
  return entry.n * Math.pow(0.5, weeks);
}

/** The menu item a live pathname belongs to: longest href prefix wins. */
function menuHrefFor(pathname: string): string | undefined {
  let best: string | undefined;
  for (const section of MENU) {
    for (const item of section.items) {
      const base = item.href.split(/[?#]/)[0];
      if (base === "/") continue;
      if (pathname === base || pathname.startsWith(`${base}/`)) {
        // >= so a duplicated href (Sources and Settings share /settings)
        // credits the later, canonical menu entry.
        if (!best || base.length >= best.length) best = item.href;
      }
    }
  }
  if (!best && (pathname === "/" || pathname.startsWith("/drafts"))) best = "/";
  return best;
}

// ---------- fuzzy matching: sloppy half-typed queries still land ----------

/** Do the query's characters appear in order? "slnv" finds "Email sequencer". */
function subsequence(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

interface Hit {
  item: MenuItem;
  area: MenuArea;
  sectionLabel: string;
  score: number;
}

function searchMenu(q: string): Hit[] {
  const hits: Hit[] = [];
  for (const section of MENU) {
    const sec = section.label.toLowerCase();
    for (const item of section.items) {
      const label = item.label.toLowerCase();
      const hint = item.hint.toLowerCase();
      let score: number | null = null;
      if (label.startsWith(q)) score = 100;
      else if (label.includes(q)) score = 80;
      else if (subsequence(label, q)) score = 60;
      else if (sec.startsWith(q) || sec.includes(q)) score = 50;
      else if (hint.includes(q)) score = 40;
      else if (subsequence(`${sec} ${hint}`, q)) score = 15;
      if (score !== null) {
        hits.push({ item, area: section.id, sectionLabel: section.label, score });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** The header pill, with the shortcut printed on it — that is how ⌘K spreads. */
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
      <kbd className="eyebrow hidden rounded border border-line bg-paper px-1 py-px text-[9px] text-mute sm:inline">
        ⌘K
      </kbd>
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = sectionFor(pathname);
  const chromeless = pathname === "/login" || pathname === "/pitch";

  // Route change closes the sheet, adjusted during render rather than in an
  // effect — the same pattern the tab bar already uses.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setQuery("");
    setSelected(0);
  }

  // Every founder page visit bumps its menu destination, so the sheet's
  // "jump back in" row converges on the four or five pages actually lived in.
  useEffect(() => {
    if (chromeless) return;
    const href = menuHrefFor(pathname.split(/[?#]/)[0]);
    if (!href) return;
    const map = readFrec();
    const entry = map[href] ?? { n: 0, last: 0 };
    map[href] = { n: entry.n + 1, last: Date.now() };
    try {
      localStorage.setItem(FREC_KEY, JSON.stringify(map));
    } catch {
      /* storage full or blocked: the row just stays as it was */
    }
  }, [pathname, chromeless]);

  // Opening goes through here, never through bare setOpen(true): frecency is
  // read at the moment of opening, in the event handler rather than an
  // effect, so the row reflects this second's history and localStorage is
  // only ever touched in the browser.
  function setSheet(next: boolean) {
    if (next) {
      const now = Date.now();
      const map = readFrec();
      const currentHref = menuHrefFor(pathname.split(/[?#]/)[0]);
      const top = Object.entries(map)
        .filter(([href]) => href !== currentHref)
        .sort((a, b) => frecencyScore(b[1], now) - frecencyScore(a[1], now))
        .slice(0, 5)
        .map(([href]) => href);
      setRecents(top);
    }
    setOpen(next);
  }

  // ⌘K / Ctrl+K from anywhere — open, or close if already up. Registered
  // always, not only while open, which is the entire point of the shortcut.
  useEffect(() => {
    if (chromeless) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSheet(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

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
  }, [open, pathname]);

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => (q ? searchMenu(q) : []), [q]);

  // Founder chrome only. The public signup page and login go bare — but the
  // provider still has to wrap the tree, or every trigger below it throws.
  if (chromeless) {
    return <MenuContext.Provider value={setOpen}>{children}</MenuContext.Provider>;
  }

  const sel = Math.min(selected, Math.max(0, hits.length - 1));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  /** Palette keys, on the input so the sheet needs no focus juggling. */
  function onInputKey(e: React.KeyboardEvent) {
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((sel + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((sel - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[sel].item.href);
    }
  }

  const recentItems = recents
    .map((href) => {
      for (const section of MENU) {
        const item = section.items.find((i) => i.href === href);
        if (item) return { item, area: section.id };
      }
      return undefined;
    })
    .filter((x): x is { item: MenuItem; area: MenuArea } => x !== undefined);

  return (
    <MenuContext.Provider value={setSheet}>
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

            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              onKeyDown={onInputKey}
              type="search"
              placeholder="Type to jump anywhere"
              aria-label="Search the console"
              aria-activedescendant={q && hits.length ? `menu-hit-${sel}` : undefined}
              role="combobox"
              aria-expanded={q.length > 0}
              aria-controls={q && hits.length ? "menu-hits" : undefined}
              className="mt-6 w-full rounded-input border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-mute focus:border-indigo focus:outline-none"
            />

            {q ? (
              // ----- palette mode: one ranked list, driven from the keyboard -----
              <div className="mt-6">
                {hits.length === 0 && (
                  <p className="mt-6 text-slate">
                    Nothing matches that. Clear the box to see the map.
                  </p>
                )}
                <ul id="menu-hits" role="listbox" aria-label="Matches" className="flex flex-col gap-1.5">
                  {hits.map((hit, i) => {
                    const Icon = iconByName(hit.item.icon);
                    const active = i === sel;
                    return (
                      <li key={hit.item.href + hit.item.label} role="presentation">
                        <Link
                          id={`menu-hit-${i}`}
                          role="option"
                          aria-selected={active}
                          href={hit.item.href}
                          onClick={() => setOpen(false)}
                          onMouseEnter={() => setSelected(i)}
                          className={`flex items-center gap-3.5 rounded-card border px-4 py-3 ${
                            active
                              ? "border-indigo/40 bg-white shadow-[0_10px_30px_-14px_rgba(46,48,248,0.35)]"
                              : "border-transparent bg-transparent"
                          }`}
                        >
                          <Icon size={19} className={`shrink-0 ${active ? "text-indigo" : "text-slate"}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold leading-snug text-ink">
                              {hit.item.label}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] leading-snug text-slate">
                              {hit.item.hint}
                            </span>
                          </span>
                          <span className={`eyebrow shrink-0 text-[10px] ${AREA_TONE[hit.area]}`}>
                            {hit.sectionLabel}
                          </span>
                          {active && (
                            <kbd aria-hidden className="eyebrow hidden rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-mute sm:inline">
                              ↵
                            </kbd>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              // ----- map mode: the overview, with your own trail on top -----
              <div className="mt-8 flex flex-col">
                {recentItems.length > 0 && (
                  <div
                    style={{ transitionDelay: open ? "40ms" : "0ms" }}
                    className={`pb-6 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                    }`}
                  >
                    <p className="eyebrow mb-2.5 text-slate">Jump back in</p>
                    <nav aria-label="Recent destinations" className="flex flex-wrap gap-2">
                      {recentItems.map(({ item, area }) => {
                        const Icon = iconByName(item.icon);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            title={item.hint}
                            className="pressable flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo/30 hover:text-indigo"
                          >
                            <Icon size={15} className={`shrink-0 ${AREA_TONE[area]}`} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                )}

                {MENU.map((section, si) => (
                  <section
                    key={section.id}
                    // Sections arrive one after another rather than together, so
                    // the sheet reads as unfolding instead of blinking on.
                    style={{
                      transitionDelay: open ? `${80 + si * 45}ms` : "0ms",
                    }}
                    className={`grid gap-x-8 gap-y-3 py-6 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:grid-cols-[12rem_1fr] ${
                      si > 0 || recentItems.length > 0 ? "border-t border-line" : ""
                    } ${open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
                  >
                    {/* The left rail: what the eye runs down to get the overview.
                        The sheared tick is the brand's one shape, in the
                        section's own hue — wayfinding, not decoration. */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span aria-hidden className={`slant-rule w-5 shrink-0 ${AREA_TONE[section.id]}`} />
                        <h3 className="display text-[19px] text-ink">{section.label}</h3>
                      </div>
                      {current === section.id && (
                        <span className="eyebrow mt-1 block text-indigo">You are here</span>
                      )}
                      <p className="mt-1.5 hidden text-[13px] leading-snug text-slate sm:block">
                        {section.blurb}
                      </p>
                    </div>

                    <nav aria-label={section.label} className="flex flex-wrap content-start items-start gap-2">
                      {section.items.map((item) => {
                        const Icon = iconByName(item.icon);
                        const here = pathname === item.href.split(/[?#]/)[0];
                        return (
                          <Link
                            key={item.href + item.label}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            title={item.hint}
                            className={`pressable flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold ${
                              here
                                ? "border-indigo/40 bg-indigo-tint/60 text-indigo"
                                : "border-line bg-white text-ink hover:border-indigo/30 hover:text-indigo"
                            }`}
                          >
                            <Icon size={15} className={`shrink-0 ${here ? "text-indigo" : "text-slate"}`} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </nav>
                  </section>
                ))}
              </div>
            )}

            {/* The palette's cheat line. Pointer devices can ignore it forever. */}
            <p className="eyebrow mt-10 hidden gap-4 text-[10px] text-mute sm:flex">
              <span>⌘K open</span>
              <span>↑↓ move</span>
              <span>↵ go</span>
              <span>esc close</span>
            </p>
          </div>
        </div>
      </div>
    </MenuContext.Provider>
  );
}
