import "./AppNav.css";

export interface AppNavItem {
  label: string;
  href: string;
}

interface AppNavProps {
  activeHref: string;
}

const NAV_ITEMS: AppNavItem[] = [
  { label: "Home", href: "/" },
  { label: "Review", href: "/review" },
  { label: "Library", href: "/library" },
  { label: "Grammar", href: "/grammar" },
];

/**
 * AppNav — phone bottom bar (shell.md D3 AppNav). Fixed to bottom, visible
 * only below bp-tablet (640px). SiteHeader owns navigation at bp-tablet+.
 */
export function AppNav({ activeHref }: AppNavProps) {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        const active = item.href === activeHref;
        return (
          <a
            key={item.href}
            href={item.href}
            className={
              "app-nav__item" + (active ? " app-nav__item--active" : "")
            }
            aria-current={active ? "page" : undefined}
          >
            <span className="app-nav__label">{item.label}</span>
            {active && <span className="app-nav__indicator" aria-hidden="true" />}
          </a>
        );
      })}
    </nav>
  );
}
