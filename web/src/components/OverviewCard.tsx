import type { ReactNode } from "react";
import "./OverviewCard.css";

interface OverviewCardProps {
  /** Area title, e.g. "Review". */
  title: string;
  /** Status sentence below the title (counts-are-sentences). */
  blurb: ReactNode;
  /** Optional leading count, rendered in --font-meta within the status line. */
  stat?: ReactNode;
  /** Destination — the whole card is the link target. Routing is the caller's. */
  href: string;
  /** Zero state: status sentence reads faint with an inviting verb. */
  zero?: boolean;
}

/**
 * OverviewCard — a single entry point on Home (D4, home.md). The whole card is
 * one link/tap target; paper surface with a hairline rule, no icons.
 */
export function OverviewCard({
  title,
  blurb,
  stat,
  href,
  zero = false,
}: OverviewCardProps) {
  return (
    <a
      href={href}
      className={"overview-card" + (zero ? " overview-card--zero" : "")}
    >
      <span className="overview-card__title">{title}</span>
      <span className="overview-card__status">
        {stat && <span className="overview-card__stat">{stat}</span>}
        {blurb}
      </span>
    </a>
  );
}
