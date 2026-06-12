import type { ReactNode } from "react";
import "./SiteFooter.css";
import { Button } from "./Button";

/** One utility link in the footer row. Routing is the caller's job. */
export interface FooterLink {
  label: string;
  href: string;
}

interface SiteFooterProps {
  /** Quiet utility links (e.g. Ingest · Progress · System · Docs). */
  links: FooterLink[];
  /** Current theme — the toggle's label is the current theme word. */
  theme: "light" | "dark";
  /** Theme toggle handler. Global theme state lives elsewhere; this only signals. */
  onToggleTheme?: () => void;
  /** Live machine status as a sentence (counts-are-sentences). */
  children?: ReactNode;
}

/**
 * SiteFooter — the quiet utility footer closing every non-session screen
 * (D3, shell.md). Recessed --color-paper-sunken band, hairline top, no shadow.
 * Information, not decoration: no logotype, no copyright, no icons.
 */
export function SiteFooter({
  links,
  theme,
  onToggleTheme,
  children,
}: SiteFooterProps) {
  const themeLabel = theme === "dark" ? "Dark" : "Light";
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <nav className="site-footer__links" aria-label="Utility">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="site-footer__link">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="site-footer__meta">
          <span className="site-footer__status">{children}</span>
          <Button
            variant="quiet"
            className="site-footer__theme"
            onClick={onToggleTheme}
            aria-label={`Theme: ${themeLabel}`}
          >
            {themeLabel}
          </Button>
        </div>
      </div>
    </footer>
  );
}
