"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Glyph } from "@/components/icons";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { WORKSPACE_GROUPS, isWorkspaceRoute, routeIsActive } from "@/lib/workspace-nav";
import { cn } from "@/lib/cn";
const TABS = [
  { href: "/", label: "Home", icon: "IconGrid" },
  { href: "/clients", label: "Clients", icon: "IconTeam" },
  { href: "/workspaces", label: "Projects", icon: "IconIntegration" },
  { href: "/calendar", label: "Calendar", icon: "IconTime" },
];
export function TabBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const activeIndex = open ? 4 : TABS.findIndex(t => routeIsActive(path, t.href));
  if (!isWorkspaceRoute(path)) return null;
  return (
    <nav className="workspace-tabs" aria-label="Mobile navigation">
      <span className="tab-selection-track" aria-hidden="true"><span style={{ transform: `translateX(${(activeIndex < 0 ? 4 : activeIndex) * 100}%)` }} /></span>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={routeIsActive(path, t.href) ? "page" : undefined}
          className={cn(
            "mobile-tab",
            (!open && routeIsActive(path, t.href)) && "is-active",
          )}
        >
          <Glyph name={t.icon} size={21} />
          <span>{t.label}</span>
        </Link>
      ))}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild><button type="button" className={cn("mobile-tab", (open || !TABS.some(t => routeIsActive(path, t.href))) && "is-active")} aria-label="All workspace tools"><Glyph name="IconGrid" size={21} /><span>More</span></button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="command-overlay sheet-overlay" /><Dialog.Content className="capture-sheet tools-sheet">
          <div className="sheet-handle" aria-hidden="true" /><div className="capture-heading"><Dialog.Title>Your workspace</Dialog.Title><Dialog.Close className="capture-close" aria-label="Close tools">×</Dialog.Close></div>
          <Dialog.Description>Everything you need, all in one place.</Dialog.Description>
          {WORKSPACE_GROUPS.map(group => <section key={group.label}><h3>{group.label}</h3><div className="tools-grid">{group.items.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={routeIsActive(path,item.href) ? "page" : undefined}><Glyph name={item.icon} size={21} /><span>{item.label}</span></Link>)}</div></section>)}
          <Link href="/settings" className="tools-settings" onClick={() => setOpen(false)}>Appearance & settings<Glyph name="IconChevron" size={17} /></Link>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </nav>
  );
}
