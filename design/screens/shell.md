> Global chrome shared by every screen — read together with `design/tokens.md`.
> Structural reference (not identity): merriam-webster.com — a slim persistent
> masthead, a clear content spine, and a quiet utility footer. We borrow that
> *structure*; the look stays The Entry (INDEX D0/D1). No logotype: the app is
> name-agnostic, so the masthead carries the screen title, never a wordmark.

## D3 — Global shell

Three chrome elements: **SiteHeader** (top), the content spine, and **SiteFooter** (bottom). Session screens replace SiteHeader with a session bar and drop the footer.

### SiteHeader — persistent masthead + navigation

One slim bar, present on every non-session screen, `--header-height` tall, sticky to the top with a `--color-rule` hairline along its bottom edge and `--color-paper` background (no shadow — it sits flush; the hairline does the separating). Content is centered to `--measure-app`.

- **Below `bp-tablet` (phone):** the header shows the **screen title** left (`--font-app`, `--text-lg`, `--weight-bold`, `--color-ink`) and the **Ask** button right (see below). Primary navigation lives in the **bottom bar** (`AppNav`, below) so the thumb owns it.
- **`bp-tablet`+ (tablet/desktop):** the header IS the navigation. Screen title left as the masthead; nav links right. There is no separate bottom bar at this width.

**AppNav (bottom bar, phone only).** Fixed to the bottom, `--hit-target` tall, `--color-paper` with a `--color-rule` top hairline, four items: **Home · Review · Library · Grammar**. Each is `--font-app` `--text-xs` label over a small glyph-free indicator; the active item is `--color-accent` with a `--color-accent-wash` underline-pill. A trailing **Add** action closes the bar — a typographic "+" glyph (`--text-lg`, `--color-accent`) over an "Add" label, same cell metrics as a nav item — that opens the global **Quick-add** modal (`components.md` QuickAdd). It is a button, not a destination: it never shows an active state and carries no underline-pill. The four navigation destinations are unchanged. Ingest, Quiz, Lessons, Suggestions, Progress, and System are reached from Home's overview sections and from within the four primary screens (Quiz from Home/Review; Ingest from Home/Library; Lessons from Ingest's Recent list and Grammar topics; Suggestions from a Home nudge; System and Progress from Home's footer/utility row).

**Top-bar nav (tablet/desktop).** Right-aligned links in `--font-app` `--text-sm` `--color-ink-soft`, gap `--space-4`: **Home · Review · Library · Grammar · Lessons · Suggestions · Ingest · Progress · System**. Hover → `--color-ink`. Active link → `--color-accent` with a 2px `--color-accent` bottom rule (the hairline below the bar shows through as the inactive baseline). A quiet **+ Add** Button — opening the same global **Quick-add** modal (`components.md` QuickAdd) — sits immediately left of Ask, separated from the nav links by `--space-5`. The **Ask** button is the rightmost item, separated from + Add by `--space-3`.

**Ask button** — a plain quiet Button "Ask" (never a floating bubble, never an icon-only blob). Right-aligned in the header on phone; rightmost top-bar item at `bp-tablet`+. Opens `screens/ask.md` seeded with the current page context. Session screens surface Ask only inside "Explain why" flows — never in the session bar.

### Session takeover — Review, Quiz play, Triage

No SiteHeader, no AppNav, no footer. A slim session bar replaces the header: close `×` (44px square) left, center `--font-meta` progress ("7 of 23"), and a 2px `--color-rule` track under the bar with `--color-accent` fill = progress. Closing mid-session asks nothing; progress is saved per answer.

The takeover is the **active run** only — an in-progress sequence of cards or questions. A session route's **resting states** (its pre-session landing such as "23 due today → Start review," its empty state when nothing is due, and its finished/summary state) are ordinary non-session screens with full chrome (SiteHeader, AppNav on phone, SiteFooter) so the user is never stranded without navigation; entering the active run (e.g. tapping "Start review") triggers the takeover, and the session-bar `×` returns to that landing. Quiz already follows this (config landing with chrome → play takeover); Review and Triage land the same way.

### SiteFooter — quiet utility footer

A simple footer closing every non-session screen — the merriam-webster *structural* cue (a calm utility strip), never a marketing footer. Full-bleed `--color-paper-sunken` band with a `--color-rule` top hairline; inner content centered to `--measure-app`, vertical padding `--space-6`.

- One row (wraps on phone) of quiet utility links, all `--font-app` `--text-sm` `--color-ink-soft`, hover `--color-ink`: **Ingest · Progress · System · Docs**.
- A meta line, `--font-meta` `--text-xs` `--color-ink-faint`: live machine status as a sentence — "412 words · 61 mature · last backup Jun 11" — and a right-aligned **theme toggle** (quiet Button, label "Light"/"Dark", reflecting current `data-theme`; persists the choice). Counts here reuse the same source as ProgressStat / JobStatus and follow the counts-are-sentences rule.
- No logotype, no copyright line, no social icons. The footer is information, not decoration.

### Page defaults

All non-session screens: background `--color-paper`; content spine max-width `--measure-app` centered at `bp-desktop`+ except where a screen names `--measure-reading` (lessons, long-form). The header is sticky; the footer is static at the end of the spine (it is not fixed). Scroll restores to top on route change except within a session.
