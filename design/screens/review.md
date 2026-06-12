> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.2 Review session

**Purpose.** The sacred path: answer one card at a time, one thumb, no chrome. Default multiple-choice; flip-card fallback.

**Regions.**

1. _Session bar_ — close ×, "7 of 23" (`--font-meta`), hairline progress fill.
2. _Card region_ — one `ReviewCard` (see D4) on `--color-surface`, `--radius-2`, `--shadow-1`, `--space-5` padding. Contains the question `WordEntry` fragment (headword or cloze stem) and the prompt line.
3. _Answer region_ — 4 `QuizOption`s stacked, `--space-2` gaps. In flip-card mode this region is the three self-grade Buttons ("Didn't know / Knew it / Easy").
4. _Action region (thumb zone)_ — before answering: quiet Button "Don't know" (no "Check answer" button — selecting an option is the answer). After answering: verdict line + "Explain why" quiet Button + primary Button "Next".

```
Mobile 390px — mid-question        Desktop ≥960px — centered column 560px
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│ ×        7 of 23         │       │ ×            7 of 23                 │
│ ━━━━━━━━─────────────────│       │ ━━━━━━━━━────────────────────────────│
│ ┌──────────────────────┐ │       │        desasosiego                   │
│ │ desasosiego          │ │       │        ES · SUSTANTIVO · C1          │
│ │ ES · SUSTANTIVO · C1 │ │       │        Choose the definition.        │
│ │ Choose the definition│ │       │   ① restlessness; unease…            │
│ └──────────────────────┘ │       │   ② forgetfulness…                   │
│ ○ restlessness; unease…  │       │   ③ boredom…                         │
│ ● carelessness… (selected│       │   ④ longing…                         │
│ ○ boredom; tedium…       │       │                                      │
│ ○ longing for home…      │       │   1–4 answer · Enter next            │
│                          │       └──────────────────────────────────────┘
│   Don't know  (quiet)    │
└──────────────────────────┘
```

**Responsive.** Mobile: options and actions fill width, bottom-anchored action region. Desktop: 560px centered column; options selectable by keys 1–4; key hints (`--font-meta` `--text-xs`) visible at `bp-desktop`+ only.

**States.**

- _Answer feedback:_ selection grades immediately — tapping an option (or pressing 1–4) reveals correct/incorrect at once; there is no separate "Check answer" step (mirrors the Quiz play screen). Then see D5 choreography: correct option fills `--color-correct-wash` with `--color-correct` border; chosen-wrong fills incorrect equivalents; others dim to `--color-ink-faint`.
- _Explain why:_ expands below options as a hairline-topped panel, `--font-app` `--text-base` `--leading-base`; generated text streams in; while loading shows "Explaining…" in `--font-meta`.
- _End of session:_ summary view — "20 cards · 17 correct" (`--text-xl`), missed words listed as compact `WordEntry` rows, primary Button "Done", quiet Button "Review the 3 missed again".
- _Empty (opened with 0 due):_ EmptyState "Nothing due. Ingest something new?" + quiet Button to Ingest.
- _Error (explain call fails):_ inline in the panel — "Couldn't generate the explanation. Try again." with retry quiet Button. The session never blocks on it.
- _Overflow (40-word definition options):_ options grow vertically, `--leading-snug`; card region scrolls independently if total height exceeds viewport — action region never moves off-screen.

---

