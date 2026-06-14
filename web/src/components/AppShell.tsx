import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { OverviewSummary, WordLanguage } from "@estudio/shared";
import { AppNav } from "./AppNav";
import { SiteHeader, type NavItem } from "./SiteHeader";
import { SiteFooter, type FooterLink } from "./SiteFooter";
import { Toast } from "./Toast";
import { QuickAddModal } from "./QuickAddModal";
import { QuickAddProvider } from "./QuickAddContext";
import { fetchOverview } from "../screens/overviewApi";
import {
  applyTheme,
  persistTheme,
  readTheme,
  type Theme,
} from "../theme";
import { monthDay } from "../format";
import "./AppShell.css";

/** Async state of the shared overview read, passed to the wrapped screen. */
export interface OverviewState {
  summary?: OverviewSummary;
  error?: Error;
  loading: boolean;
}

interface AppShellProps {
  /** Screen title carried by the masthead (name-agnostic — never a wordmark). */
  title: string;
  /** The href of the active primary-nav destination, e.g. "/library". */
  activeHref: string;
  /** The wrapped screen, given the shared overview state (one fetch, shared). */
  children: (overview: OverviewState) => ReactNode;
}

/** Primary nav — only real, built routes (shell.md order). */
const NAV: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "Review", href: "/review" },
  { label: "Library", href: "/library" },
  { label: "Grammar", href: "/grammar" },
  { label: "Lessons", href: "/lessons" },
  { label: "Suggestions", href: "/suggestions" },
  { label: "Ingest", href: "/ingest" },
  { label: "Progress", href: "/progress" },
  { label: "System", href: "/system" },
];

/** Quiet utility links closing the footer — real routes only. */
const FOOTER_LINKS: FooterLink[] = [
  { label: "Ingest", href: "/ingest" },
  { label: "Progress", href: "/progress" },
  { label: "Notes", href: "/notes" },
  { label: "System", href: "/system" },
];

/** The footer's live machine status as a sentence (counts-are-sentences). */
function footerStatus(state: OverviewState): string {
  if (!state.summary) return "— words · — mature";
  const { library } = state.summary;
  const base = `${library.total} words · ${library.mature} mature`;
  return state.summary.lastBackupAt
    ? `${base} · last backup ${monthDay(state.summary.lastBackupAt)}`
    : base;
}

/**
 * AppShell — the shared chrome for every non-session screen (shell.md D3):
 * SiteHeader above, the screen in the content spine, SiteFooter below. It owns
 * the single overview fetch (shared with the footer) and the global theme.
 */
export function AppShell({ title, activeHref, children }: AppShellProps) {
  const [overview, setOverview] = useState<OverviewState>({ loading: true });
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddToast, setQuickAddToast] = useState<string | null>(null);
  const [initialTerm, setInitialTerm] = useState<string | undefined>();
  const [initialLanguage, setInitialLanguage] = useState<WordLanguage | undefined>();

  useEffect(() => {
    let live = true;
    fetchOverview()
      .then((summary) => {
        if (live) setOverview({ summary, loading: false });
      })
      .catch((error: unknown) => {
        if (live)
          setOverview({
            error: error instanceof Error ? error : new Error("failed"),
            loading: false,
          });
      });
    return () => {
      live = false;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  const nav: NavItem[] = NAV.map((n) => ({ ...n, active: n.href === activeHref }));

  const handleAsk = useCallback(() => {
    const label = encodeURIComponent(title);
    window.location.href = `/ask?new=1&kind=other&label=${label}`;
  }, [title]);

  const openQuickAdd = useCallback(
    (term?: string, lang?: WordLanguage) => {
      setInitialTerm(term);
      setInitialLanguage(lang);
      setQuickAddOpen(true);
    },
    [],
  );

  // The blank "+" affordance keeps its existing callback shape
  const handleQuickAdd = useCallback(() => openQuickAdd(), [openQuickAdd]);

  const handleQuickAddClose = useCallback(() => {
    setQuickAddOpen(false);
    setInitialTerm(undefined);
    setInitialLanguage(undefined);
  }, []);

  // Keep a stable ref for openQuickAdd to satisfy the provider value
  const openQuickAddRef = useRef(openQuickAdd);
  openQuickAddRef.current = openQuickAdd;

  return (
    <QuickAddProvider openQuickAdd={openQuickAdd}>
      <div className="app-layout">
        <SiteHeader title={title} nav={nav} onAsk={handleAsk} onQuickAdd={handleQuickAdd} />
        <main className="app-layout__main">{children(overview)}</main>
        <SiteFooter links={FOOTER_LINKS} theme={theme} onToggleTheme={toggleTheme}>
          {footerStatus(overview)}
        </SiteFooter>
        <AppNav activeHref={activeHref} onQuickAdd={handleQuickAdd} />
        <QuickAddModal
          open={quickAddOpen}
          onClose={handleQuickAddClose}
          initialTerm={initialTerm}
          initialLanguage={initialLanguage}
          onAdded={(w) => {
            handleQuickAddClose();
            setQuickAddToast(`Added ${w.term}.`);
            fetchOverview()
              .then((summary) => setOverview({ summary, loading: false }))
              .catch(() => {});
          }}
        />
        {quickAddToast && (
          <Toast onDismiss={() => setQuickAddToast(null)}>
            {quickAddToast}
          </Toast>
        )}
      </div>
    </QuickAddProvider>
  );
}
