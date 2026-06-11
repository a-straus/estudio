> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.1 Today

**Purpose.** Open the app → know what's due → start in one tap. Landing screen on every visit.

**Regions.**

1. _Masthead_ — "Today" (`--text-xl`, `--font-app`, `--weight-bold`) + date line in `--font-meta` `--text-xs` ("MARTES · JUNE 9").
2. _Due block_ — the one sentence that matters: "23 due today" (`--text-2xl`, `--font-app`, `--weight-bold`, count in `--color-accent`), beneath it a full-width primary Button "Start review". This block sits in the upper half on desktop, but on mobile the Button is pinned to the thumb zone (bottom, above AppNav).
3. _Triage nudge_ — present only when untriaged content exists: a hairline-topped row "Moby-Dick · 31 words waiting" + quiet Button "Continue triage".
4. _Mastery line_ — `--font-meta` `--text-sm` `--color-ink-soft`: "412 words · 61 mature · 3 books". No tiles, no charts.

```
Mobile 390px                      Desktop 1280px
┌──────────────────────────┐      ┌──────────────────────────────────────────────┐
│ Today        MAR · JUN 9 │      │ Today              Today Library Grammar ... │
│                          │      ├──────────────────────────────────────────────┤
│                          │      │                                              │
│   23 due today           │      │   23 due today                               │
│                          │      │   [ Start review ]                           │
│ ──────────────────────── │      │                                              │
│ Moby-Dick                │      │ ─────────────────────────────────────────────│
│ 31 words waiting         │      │ Moby-Dick · 31 words waiting  [Continue triage]
│ [ Continue triage ]      │      │                                              │
│                          │      │ 412 words · 61 mature · 3 books              │
│ 412 words · 61 mature    │      │                                              │
│                          │      └──────────────────────────────────────────────┘
│ [    Start review     ]  │
│ Today Library Gram Prog  │
└──────────────────────────┘
```

**Responsive.** Mobile: primary Button fixed above AppNav (`--space-4` margins); content scrolls under it. Desktop: button inline under the due count, width fits content.

**States.**

- _Empty (nothing due, nothing untriaged):_ due block reads "Nothing due." (`--color-ink`) with EmptyState line "Ingest something new?" linking to Ingest. Mastery line still shown.
- _Loading:_ due count renders as an em-dash "— due today" for ≤300ms; no spinners on this screen.
- _Error (store unreadable):_ Toast, error variant: "Couldn't load your decks. Reload, or check System for details."
- _Overflow:_ multiple sources awaiting triage stack as separate hairline rows; max 3 shown + "2 more in Ingest".

---

