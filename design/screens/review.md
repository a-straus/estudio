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

### 3.2b Review session — Yes/No (binary) format

**Purpose.** An opt-in, Mochi-style "do you know it?" format: show one side, reveal the other on a tap, self-grade with a single binary choice. For words you mostly recognise it is faster than reading four options. **Multiple-choice (3.2) stays the default**; this is a render mode, not a replacement. Translated to our identity — a hairline splits the two sides of the entry, the grade is two plain Buttons in the thumb zone; none of Mochi's dark circular-icon chrome.

**Format preference.** A `reviewFormat` preference — `mc` (default) · `yesno` — chooses the render mode. It is set and persisted from a small `SegmentedControl` on the **Review landing** (the "{N} cards due" pre-session screen), labelled "Review format · Multiple choice / Yes-No". Changing it persists immediately (it is a real preference, not just this session) and applies to the run you start next. (Per-deck variants are deliberately out of scope — single user, two decks; revisit only if a real need appears.)

**Regions (active run).**

1. _Session bar_ — identical to 3.2 (close ×, "7 of 23" `--font-meta`, hairline progress fill).
2. _Card region_ — one `ReviewCard` in `yesno` mode. **Front:** the question side only — `WordEntry size=hero` (w2d: the headword) or the definition cue (d2w) — plus the prompt line "Do you know it?". A `--font-meta` `--text-sm` `--color-ink-faint` hint sits below the card: "Tap to reveal". The whole card is a reveal target (tap anywhere on it).
3. _Reveal_ — on tap the card shows **both** sides: the question side stays on top, a `--color-rule` hairline divides, and the answer appears below (the full `WordEntry` reveal — Spanish/English definition line(s) per the Settings preference + example), exactly the flip-back content but with the question retained above the rule (mirrors Mochi's both-sides card).
4. _Action region (thumb zone)_ — **before reveal:** the tap hint only (no buttons — the card is the affordance). **After reveal:** two Buttons, full-width stacked on mobile / side-by-side on desktop — "Didn't know" (`secondary`) and "Knew it" (`primary`). They map to the SM-2 grades **didn't know → `fail`** and **knew it → `good`** (the same grades the flip-card self-grade emits). There is no "Easy" and no "Explain why" in this mode — binary by design.

```
Mobile 390px — front                 Mobile 390px — revealed
┌──────────────────────────┐         ┌──────────────────────────┐
│ ×        7 of 23         │         │ ×        7 of 23         │
│ ━━━━━━━━─────────────────│         │ ━━━━━━━━─────────────────│
│ ┌──────────────────────┐ │         │ ┌──────────────────────┐ │
│ │ desasosiego          │ │         │ │ desasosiego          │ │
│ │ ES · SUSTANTIVO · C1 │ │         │ │ ES · SUSTANTIVO · C1 │ │
│ │ Do you know it?      │ │         │ ├──────────────────────┤ │
│ └──────────────────────┘ │         │ │ inquietud, desazón…  │ │
│      Tap to reveal       │         │ │ restlessness; unease │ │
│                          │         │ └──────────────────────┘ │
│                          │         │  Didn't know   Knew it   │
└──────────────────────────┘         └──────────────────────────┘
```

**Responsive.** Mobile: card and the two grade Buttons fill width, action region bottom-anchored. Desktop: 560px centered column; reveal on **Space** (or Enter); once revealed, **1** / **N** = "Didn't know", **2** / **Y** = "Knew it"; key hints (`--font-meta` `--text-xs`) at `bp-desktop`+ only.

**States.**

- _Front (questioning):_ as region 2; tapping the card reveals.
- _Revealed:_ both sides shown (region 3) + the two grade Buttons (region 4). Grading advances to the next card.
- _Always available:_ unlike MC, the Yes/No card needs no distractor pool, so it renders for every due word (no flip-card fallback path and no "can't build options" case).
- _End of session · Empty (0 due) · Error (save fails):_ unchanged — these resting/summary states are shared with 3.2 (the format only changes the active card).

---

