"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/menu";

/**
 * The desktop bar: one destination per section of the menu, and nothing else.
 *
 * It used to list nine pages by hand, which meant every page added since was
 * missing from it. Five slots is also all a header can hold before it turns
 * into a list — everything else is one press of Menu away, and that sheet is
 * built from this same tree so neither can fall behind the other.
 */
const LINKS = NAV;

function isActive(pathname: string, href: string): boolean {
  const base = href.split(/[?#]/)[0];
  if (base === "/") return pathname === "/" || pathname.startsWith("/drafts");
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`relative py-1 text-sm font-semibold transition-colors ${
              active
                ? "text-indigo after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-indigo"
                : "text-ink hover:text-indigo"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
