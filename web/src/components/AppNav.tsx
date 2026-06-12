import "./AppNav.css";

export interface AppNavItem {
  label: string;
  href: string;
}

interface AppNavProps {
  activeHref: string;
  onQuickAdd?: () => void;
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
export function AppNav({ activeHref, onQuickAdd }: AppNavProps) {
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
      {onQuickAdd && (
        <button
          type="button"
          className="app-nav__add"
          onClick={onQuickAdd}
          aria-label="Add a word"
        >
          <span className="app-nav__add-glyph" aria-hidden="true">+</span>
          <span className="app-nav__add-label">Add</span>
        </button>
      )}
    </nav>
  );
}
