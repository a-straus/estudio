import "./SiteHeader.css";
import { Button } from "./Button";

/** One navigation destination in the masthead. Routing is the caller's job. */
export interface NavItem {
  label: string;
  href: string;
  active?: boolean;
}

interface SiteHeaderProps {
  /** Screen title — the name-agnostic masthead carries this, never a wordmark. */
  title: string;
  /** Nav links, rendered right at bp-tablet+ (hidden on phone — AppNav owns nav). */
  nav: NavItem[];
  /** Ask button handler. The button is always present; routing/seeding is the caller's. */
  onAsk?: () => void;
  /** Quick-add handler. When present, renders a quiet "+ Add" button left of Ask. */
  onQuickAdd?: () => void;
}

/**
 * SiteHeader — the persistent, name-agnostic masthead + nav bar (D3, shell.md).
 * Sticky, --header-height tall, flush with a bottom hairline (no shadow).
 * Router-free: nav items come from props; nothing here imports a router.
 */
export function SiteHeader({ title, nav, onAsk, onQuickAdd }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <span className="site-header__title">{title}</span>
        <nav className="site-header__nav" aria-label="Primary">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={
                "site-header__link" +
                (item.active ? " site-header__link--active" : "")
              }
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        {onQuickAdd && (
          <Button
            variant="quiet"
            className="site-header__quick-add"
            onClick={onQuickAdd}
          >
            + Add
          </Button>
        )}
        {onAsk && (
          <Button variant="quiet" className="site-header__ask" onClick={onAsk}>
            Ask
          </Button>
        )}
      </div>
    </header>
  );
}
