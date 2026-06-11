> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.12 Suggestions

**Purpose.** One proposal at a time — a word or a grammar topic the app believes you don't know — with an honest reason. Add it or skip it; either way it never comes back.

**Regions.**

1. _The proposal_ — a single card, centered, same surface anatomy as ReviewCard (`--color-surface`, `--radius-2`, `--shadow-1`, padding `--space-5`):
   - Word proposal: `WordEntry size=full` (headword, tagline, both definition lines, example).
   - Topic proposal: topic title `--font-app` `--text-lg` `--weight-bold` + a one-sentence preview of what it covers.
   - Beneath either, the reason line, `--font-meta` `--text-xs` `--color-ink-faint`: "SUGGESTED · near your level · seen in your Jun 9 lesson" — the machine reports why, quietly.
2. _Actions_ — thumb zone: primary Button "Add" (word → deck + SRS; topic → practice queue), secondary "Skip". Both record the suggestion permanently; there is no maybe-later.
3. _Tally line_ — above the card, `--font-meta` `--text-xs`: "12 suggested · 7 added · 5 skipped".

```
Mobile                              Desktop
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│ Suggestions              │       │ Suggestions     Today Library … Ask  │
│ 12 SUGGESTED · 7 ADDED   │       ├──────────────────────────────────────┤
│ ┌──────────────────────┐ │       │       12 SUGGESTED · 7 ADDED         │
│ │ desenvolverse        │ │       │   ┌──────────────────────────────┐   │
│ │ ES · VERBO · C1      │ │       │   │ desenvolverse                │   │
│ │ manejarse bien…      │ │       │   │ ES · VERBO · C1              │   │
│ │ to get along, cope   │ │       │   │ manejarse bien en una…       │   │
│ │    Sabe desenvolver… │ │       │   │ to get along, to cope        │   │
│ │ SUGGESTED · near     │ │       │   │    Sabe desenvolverse solo.  │   │
│ │ your level           │ │       │   │ SUGGESTED · near your level  │   │
│ └──────────────────────┘ │       │   └──────────────────────────────┘   │
│ [        Add         ]  │       │        [ Add ]   [ Skip ]            │
│ [        Skip        ]  │       │                                      │
└──────────────────────────┘       └──────────────────────────────────────┘
```

**Responsive.** One card at every width; the card is fluid to 520px. Actions stack full-width on mobile (Add first), sit side-by-side at `bp-tablet`+ with key hints `A` / `S` at `bp-desktop`+.

**States.**

- _Loading next:_ after add/skip the card cross-fades to the next proposal (`--motion-base`); while the LLM selects, the card region shows "Choosing the next one…" in `--font-meta` — never a blank card.
- _Added:_ info Toast ("_desenvolverse_ · added to Spanish deck" / "Por/para · added to practice queue"), then advance. No celebration.
- _Pool exhausted:_ EmptyState — "Nothing left to suggest right now. Review what you've added, or ingest something new." → quiet Button "Go to Today". Honest, not apologetic; the pool regrows as the model learns more about you.
- _Error:_ "Couldn't pick a suggestion. Try again." with quiet "Retry"; the tally stays.

---
