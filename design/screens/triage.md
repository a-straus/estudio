> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.5 Triage

**Purpose.** Sort ~50 extracted words fast: Know / Learn / Skip. Mail-sorting at a good desk — keyboard on desktop, thumbs on mobile.

**Regions.**

1. _Batch header_ — source title (`--text-lg`), batch meta in `--font-meta`: "Batch 2 of 5 · 31 of 50 sorted", and for books a coverage line: "Moby-Dick · 38% triaged" with a 4px `--radius-pill` track.
2. _Row list_ — `TriageRow`s separated by hairlines. The **current** row is raised (`--color-surface`, `--shadow-1`) and fully expanded (entry + example + actions); decided rows above collapse to one line with a decision stamp (`--font-meta`: KNOW / LEARN / SKIP); upcoming rows below show headword + gloss at `--color-ink-soft`. Rows are grouped by the likely-known prediction under two `--font-meta` headers — "PROBABLY NEW · 18" / "YOU MAY KNOW THESE · 9" — and the current-row flow runs through both in order; each header carries a quiet per-group bulk Button ("Learn all 18" / "Know all 9"), undone as one step.
3. _Tally footer_ — sticky: "Know 9 · Learn 15 · Skip 7" (`--font-meta`) + quiet Button "Undo" + on batch completion primary Button "Keep 31 words".

```
Mobile 390px                       Desktop 1280px
┌──────────────────────────┐       ┌──────────────────────────────────────────────┐
│ ×   Moby-Dick   31/50    │       │ ×  Moby-Dick — extraction   31 of 50 sorted  │
│ ━━━━━━━━━━━━━━──────────  │       │ ━━━━━━━━━━━━━━━━━━━━━━───────────────────────│
│ leeward         KNOW     │       │ leeward — away from the wind      KNOW       │
│ scud            SKIP     │       │ scud — to run before a gale       SKIP       │
│ ┌──────────────────────┐ │       │ ┌──────────────────────────────────────────┐ │
│ │ obstreperous         │ │       │ │ obstreperous      EN · ADJ · C2          │ │
│ │ EN · ADJ · C2        │ │       │ │ noisy and difficult to control           │ │
│ │ noisy and difficult… │ │       │ │ “…the obstreperous crew…”                │ │
│ │ “…the obstreperous…” │ │       │ │ [Know K] [Learn L] [Skip S]              │ │
│ │ [Know][Learn][Skip]  │ │       │ └──────────────────────────────────────────┘ │
│ └──────────────────────┘ │       │ portentous — ominously significant           │
│ portentous…              │       │ lugubrious — mournful, dismal                │
│ Know 9 · Learn 15 · Skip │       │ Know 9 · Learn 15 · Skip 7      [Undo  U]    │
└──────────────────────────┘       └──────────────────────────────────────────────┘
```

**Responsive.** Mobile: action Buttons fill the current card, `--hit-target` tall, in thumb order Learn (largest) / Know / Skip. Desktop: K/L/S keys with visible hints; deciding advances the raised state to the next row, scrolled to center.

**States.**

- _Empty (no untriaged):_ EmptyState "Nothing to sort. Ingest something new?"
- _Loading (definitions still generating for later rows):_ upcoming rows show gloss as "defining…" in `--font-meta` `--color-ink-faint`; sorting is never blocked by it.
- _Error (a definition failed):_ row gloss reads "definition failed — write one in Library, or retry"; row still sortable.
- _Batch complete:_ footer becomes the confirm: "Keep 24 words · 7 known archived · 19 skipped" + primary "Keep 24 words". Next batch loads after confirm.
- _Overflow:_ multi-word expressions ("por lo tanto") and 40-word glosses wrap inside the row; rows never truncate the term itself.

---

