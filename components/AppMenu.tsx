"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { MENU } from "@/lib/menu";
import {
  commandScore,
  isWorkspaceRoute,
  WORKSPACE_GROUPS,
} from "@/lib/workspace-nav";
import { Glyph } from "@/components/icons";
import { cn } from "@/lib/cn";

const commandLabel = (href: string, fallback: string) =>
  WORKSPACE_GROUPS.flatMap((g) => [...g.items]).find((i) => i.href === href)
    ?.label ?? fallback;

const MenuContext = createContext<(open: boolean) => void>(() => {});
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
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={className}
      aria-label={label}
      aria-haspopup="dialog"
    >
      {children}
    </button>
  );
}
export function MenuButton() {
  return (
    <MenuTrigger label="Search pages and tools" className="toolbar-search">
      <Glyph name="IconSearch" size={17} />
      <span>Search or jump to…</span>
      <kbd>⌘ K</kbd>
    </MenuTrigger>
  );
}
export function AppMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const lastTrigger = useRef<HTMLElement | null>(null);
  const isWorkspace = isWorkspaceRoute(path);
  function changeOpen(next: boolean) {
    if (next) lastTrigger.current = document.activeElement as HTMLElement;
    setOpen(next);
  }
  useEffect(() => {
    if (!isWorkspace) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) lastTrigger.current = document.activeElement as HTMLElement;
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [isWorkspace, open]);
  function go(href: string) {
    setOpen(false);
    router.push(href);
  }
  return (
    <MenuContext.Provider value={changeOpen}>
      {children}
      {isWorkspace && (
        <Dialog.Root open={open} onOpenChange={changeOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="command-overlay" />
            <Dialog.Content
              className="command-dialog"
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                lastTrigger.current?.focus();
              }}
            >
              <Dialog.Title className="sr-only">
                Search Stride Console
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Find a page or tool. Use the arrow keys to choose a result and
                Enter to open it.
              </Dialog.Description>
              <Command label="Pages and tools" loop filter={commandScore}>
                <div className="command-search">
                  <Glyph name="IconSearch" size={21} />
                  <Command.Input
                    placeholder="Where would you like to go?"
                    aria-label="Search pages and tools"
                  />
                  <Dialog.Close
                    className="command-close"
                    aria-label="Close search"
                  >
                    Esc
                  </Dialog.Close>
                </div>
                <Command.List className="command-list">
                  <Command.Empty>
                    No matching pages. Try “clients”, “invoice”, or “draft”.
                  </Command.Empty>
                  <Command.Group heading="Quick access">
                    {[
                      { label: "Home", href: "/", icon: "IconGrid" },
                      {
                        label: "Ask Stride",
                        href: "/ask",
                        icon: "IconAskStride",
                      },
                      {
                        label: "Create content",
                        href: "/#create-content",
                        icon: "IconLineageDoc",
                      },
                      { label: "Activity", href: "/today", icon: "IconTime" },
                    ].map((i) => (
                      <Command.Item
                        key={i.label}
                        value={i.label}
                        onSelect={() => go(i.href)}
                      >
                        <Glyph name={i.icon} size={19} />
                        <span>{i.label}</span>
                        <span className="command-go">Open</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  {MENU.map((group) => (
                    <Command.Group key={group.id} heading={group.label}>
                      {group.items
                        .filter((i) => i.href !== "/" && i.href !== "/ask")
                        .map((i) => (
                          <Command.Item
                            key={i.href + i.label}
                            value={commandLabel(i.href, i.label)}
                            keywords={[group.label, i.label, i.hint]}
                            onSelect={() => go(i.href)}
                          >
                            <Glyph name={i.icon} size={19} />
                            <span className={cn("command-result")}>
                              <span>{commandLabel(i.href, i.label)}</span>
                              <small>{i.hint}</small>
                            </span>
                          </Command.Item>
                        ))}
                    </Command.Group>
                  ))}
                </Command.List>
                <div className="command-footer">
                  <span>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> Navigate
                  </span>
                  <span>
                    <kbd>↵</kbd> Open
                  </span>
                  <span>Every tool, one place</span>
                </div>
              </Command>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </MenuContext.Provider>
  );
}
