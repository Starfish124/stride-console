import Link from "next/link";
import { Glyph } from "@/components/icons";
import { cn } from "@/lib/cn";
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        <p className="section-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {children && <div className="page-heading-actions">{children}</div>}
    </section>
  );
}
export function SectionHeading({
  title,
  subtitle,
  href,
  action = "View all",
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  action?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {action}
          <Glyph name="IconChevron" size={14} />
        </Link>
      )}
      {children}
    </div>
  );
}
export function EmptyState({
  icon = "IconLayers",
  title,
  description,
  href,
  action,
  compact = false,
}: {
  icon?: string;
  title: string;
  description: string;
  href?: string;
  action?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("workspace-empty", compact && "compact")}>
      <span className="empty-icon">
        <Glyph name={icon} size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && (
        <Link className="secondary-button" href={href}>
          {action}
          <Glyph name="IconChevron" size={15} />
        </Link>
      )}
    </div>
  );
}
