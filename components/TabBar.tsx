"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Glyph } from "@/components/icons";
import { MenuTrigger } from "@/components/AppMenu";
import { isWorkspaceRoute, routeIsActive } from "@/lib/workspace-nav";
import { cn } from "@/lib/cn";
const TABS = [
  { href: "/", label: "Home", icon: "IconGrid" },
  { href: "/clients", label: "Clients", icon: "IconTeam" },
  { href: "/workspaces", label: "Projects", icon: "IconIntegration" },
  { href: "/calendar", label: "Calendar", icon: "IconTime" },
];
export function TabBar() {
  const path = usePathname();
  if (!isWorkspaceRoute(path)) return null;
  return (
    <nav className="workspace-tabs" aria-label="Mobile navigation">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={routeIsActive(path, t.href) ? "page" : undefined}
          className={cn(
            "mobile-tab",
            routeIsActive(path, t.href) && "is-active",
          )}
        >
          <Glyph name={t.icon} size={21} />
          <span>{t.label}</span>
        </Link>
      ))}
      <MenuTrigger label="Search all pages and tools" className="mobile-tab">
        <Glyph name="IconSearch" size={21} />
        <span>More</span>
      </MenuTrigger>
    </nav>
  );
}
