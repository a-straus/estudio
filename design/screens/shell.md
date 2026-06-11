> Global chrome shared by every screen — read together with `design/tokens.md`.

## D3 — Global shell

**Global shell.** Two chrome patterns:

- **`AppNav`** — persistent navigation. Below `bp-tablet`: bottom bar, 4 items (Today · Library · Grammar · Progress), each `--hit-target` tall, `--font-app` `--text-xs` labels, active item `--color-accent` with `--color-accent-wash` underline-pill; Ingest and System are reached from within Today/Library and Progress respectively; Lessons from Ingest's Recent list and Grammar topics; Suggestions from a Today nudge. At `bp-tablet`+: a single top bar — screen title left, nav links right (Today · Library · Grammar · Lessons · Suggestions · Ingest · Progress · System) in `--font-app` `--text-sm`, active link `--color-accent` with 2px bottom rule; bar bottom edge is a `--color-rule` hairline.
- **Ask button** — a plain quiet Button "Ask" (never a floating bubble, never an icon-only blob), present on every non-session screen: right-aligned in the masthead row below `bp-tablet`, rightmost top-bar item at `bp-tablet`+. Opens `screens/ask.md` seeded with the current page context. Session screens (Review, Quiz play, Triage) surface Ask only inside "Explain why" flows — never in the session bar.
- **Session takeover** (Review, Quiz play, Triage) — no AppNav. A slim session bar: close `×` (44px square) left, center `--font-meta` progress ("7 of 23"), and a 2px `--color-rule` track under the bar with `--color-accent` fill = progress. Closing mid-session asks nothing; progress is already saved per answer.

All screens: background `--color-paper`, content max-width `--measure-app` centered at `bp-desktop`+ except where noted.
