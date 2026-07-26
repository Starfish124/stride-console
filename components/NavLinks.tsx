"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Console" },
  { href: "/library", label: "Library" },
  { href: "/radar", label: "Radar" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/seo", label: "Search" },
  { href: "/outreach", label: "Outreach" },
  { href: "/events", label: "Events" },
  { href: "/playbook", label: "Playbook" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/drafts");
  return pathname === href || pathname.startsWith(`${href}/`);
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
