import Link from "next/link";
import { Glyph } from "@/components/icons";

/**
 * One dashboard, framed.
 *
 * Three files were repeating the same header markup and drifting apart while
 * they did it. The fixed-height bar is the point: five panels sitting side by
 * side on the deck rail put their titles on one line, which is what makes the
 * row read as instruments rather than as five unrelated cards.
 *
 * The header holds still and the body scrolls, so a panel that overruns never
 * pushes its own title off the top.
 */
export function Panel({
  icon,
  title,
  href,
  linkLabel,
  meta,
  children,
}: {
  icon: string;
  title: string;
  href?: string;
  linkLabel?: string;
  /** A short fact about the panel itself, such as when it last ran. */
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="deck-slide card-glass w-full rounded-card border border-line bg-white">
      <header className="flex h-9 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <Glyph name={icon} size={16} className="shrink-0 text-indigo" />
        <h2 className="display flex-1 truncate text-[17px] text-ink">{title}</h2>
        {meta && <span className="eyebrow shrink-0 text-slate">{meta}</span>}
        {href && linkLabel && (
          <Link href={href} className="eyebrow shrink-0 text-indigo hover:text-indigo-deep">
            {linkLabel}
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

/** A labelled number in a panel's foot strip. Unknown prints an em dash. */
export function PanelFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <p className="figure text-[17px] text-ink">{value}</p>
      <p className="eyebrow mt-1 text-slate">{label}</p>
    </div>
  );
}
