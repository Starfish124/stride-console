"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { workspaceLocation } from "@/lib/workspace-nav";
import { MenuButton } from "@/components/AppMenu";
import { StrideLogo } from "@/components/StrideLogo";
import { Glyph } from "@/components/icons";
export function WorkspaceToolbar() {
  const path = usePathname();
  const location = workspaceLocation(path);
  return (
    <header className="workspace-toolbar">
      <div className="toolbar-location">
        <Link
          href="/"
          aria-label="Stride home"
          className={path === "/" ? "toolbar-mobile-brand" : "toolbar-mobile-brand toolbar-compact-brand"}
        >
          <StrideLogo />
        </Link>
        <span className="toolbar-area">{location.area}</span>
        <span className="toolbar-divider" aria-hidden>
          /
        </span>
        <span className="toolbar-page-label">{path === "/" ? null : location.label}</span>
      </div>
      <div className="toolbar-actions">
        <MenuButton />
        <Link href="/ask" className="toolbar-ask" aria-label="Ask Stride">
          <Glyph name="IconAskStride" size={18} />
          <span>Ask Stride</span>
        </Link>
      </div>
    </header>
  );
}
