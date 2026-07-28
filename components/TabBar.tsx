"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconPipeline, IconTeam, IconLayers } from "@/components/icons";
import { MenuTrigger } from "@/components/AppMenu";

/**
 * Phone-width navigation: an app-style tab bar in thumb reach, because the
 * console is used as an app on a phone far more than as a site on a desktop.
 * Hidden at sm and up, where the header nav takes over.
 *
 * Four destinations and a way to everything else. The last slot used to open
 * its own action sheet listing five more pages, which stopped scaling the
 * moment the console grew past those five — it now opens the full menu, which
 * is the one place the whole machine is written down.
 */

const TABS = [
  { href: "/", label: "Console", icon: IconGrid },
  { href: "/campaigns", label: "Campaigns", icon: IconPipeline },
  { href: "/clients", label: "Clients", icon: IconTeam },
  { href: "/library", label: "Library", icon: IconLayers },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/drafts");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const pathname = usePathname();

  // The tab bar is founder chrome. Login and the public signup page go bare.
  if (pathname === "/login" || pathname === "/pitch") return null;

  const onATab = TABS.some((t) => isActive(pathname, t.href));

  return (
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
              <Icon size={23} strong={active} />
              <span className="text-[10px] font-semibold tracking-[0.01em]">{tab.label}</span>
            </Link>
          );
        })}

        <MenuTrigger
          label="Everything in the console"
          className={`pressable flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 ${
            onATab ? "text-slate" : "text-indigo"
          }`}
        >
          {/* The mark's shear again, so the way to everything is drawn in the
              one shape the brand owns rather than in three level lines. */}
          <span aria-hidden className="flex h-[23px] w-[21px] flex-col justify-center gap-[4px]">
            <span className="slant-rule h-[2.5px] w-full" />
            <span className="slant-rule h-[2.5px] w-full opacity-60" />
            <span className="slant-rule h-[2.5px] w-full opacity-35" />
          </span>
          <span className="text-[10px] font-semibold tracking-[0.01em]">More</span>
        </MenuTrigger>
      </div>
    </nav>
  );
}
