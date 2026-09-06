"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  WORKSPACE_GROUPS,
  isWorkspaceRoute,
  routeIsActive,
} from "@/lib/workspace-nav";
import { Glyph } from "@/components/icons";
import { Mark } from "@/components/Ramp";
import { StrideLogo } from "@/components/StrideLogo";
import { MenuTrigger } from "@/components/AppMenu";
import { cn } from "@/lib/cn";

export interface RailClient {
  id: string;
  label: string;
}
export function railHidden(pathname: string) {
  return !isWorkspaceRoute(pathname);
}
export function SideNav({ clients = [] }: { clients?: RailClient[] }) {
  const path = usePathname();
  if (railHidden(path)) return null;
  return (
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <Link
        href="/"
        className="workspace-brand"
        aria-label="Stride Console home"
      >
        <StrideLogo />
      </Link>
      <MenuTrigger label="Search pages and tools" className="sidebar-search">
        <Glyph name="IconSearch" size={17} />
        <span>Search anything</span>
        <kbd>⌘ K</kbd>
      </MenuTrigger>
      <nav aria-label="Workspace" className="sidebar-navigation">
        {WORKSPACE_GROUPS.map((group) => (
          <section key={group.label} className="sidebar-group">
            <h2>{group.label}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={
                      routeIsActive(path, item.href) ? "page" : undefined
                    }
                    className={cn(
                      "sidebar-link",
                      routeIsActive(path, item.href) && "is-active",
                    )}
                  >
                    <Glyph name={item.icon} size={18} />
                    <span>{item.label}</span>
                    {routeIsActive(path, item.href) && (
                      <span className="nav-active-mark" aria-hidden />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {clients.length > 0 && (
          <section className="sidebar-group">
            <h2>Client spaces</h2>
            <ul>
              {clients.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}/workspace`}
                    className="sidebar-link"
                  >
                    <span className="client-monogram small">
                      {c.label.slice(0, 1)}
                    </span>
                    <span className="truncate">{c.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </nav>
      <div className="sidebar-footer">
        <Link href="/ask" className="sidebar-assistant">
          <Mark size={20} />
          <span>
            Ask Stride<span>Your workspace assistant</span>
          </span>
          <Glyph name="IconChevron" size={15} />
        </Link>
        <Link href="/settings" className="sidebar-link">
          <Glyph name="IconTuneLoop" size={18} />
          <span>Settings</span>
        </Link>
        <div className="workspace-identity">
          <span className="team-avatar">S</span>
          <span>
            Stride AI<span>Team workspace</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
export function WorkspaceSkipLink() {
  const path = usePathname();
  return railHidden(path) ? null : (
    <a className="skip-link" href="#workspace-content">
      Skip to content
    </a>
  );
}
export function RailOffset({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className={railHidden(path) ? "" : "workspace-shell"}>{children}</div>
  );
}
