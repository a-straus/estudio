> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.8 Progress

**Purpose.** Honest mastery, no engagement theater.

**Regions.**

1. _Status counts_ — three `ProgressStat`s in a row: "94 new · 257 learning · 61 mature" — each a count + word, hairline-separated, no boxes.
2. _Due forecast_ — 14-day column chart, 4px `--radius-pill` bars in `--color-accent-wash` with `--color-accent` for today; y-axis unlabeled, max value annotated once in `--font-meta`.
3. _Quiz accuracy_ — simple line of last 20 sessions, `--color-ink-soft` stroke; current value as a sentence: "Last 20 sessions · 84% average".
4. _Book coverage_ — per-source rows: "Moby-Dick · 38% triaged · 122 words kept" with pill track.
5. _Footer link_ — quiet link to System ("Spend, jobs & backups →").

```
Mobile                             Desktop (1120px)
┌──────────────────────────┐       ┌──────────────────────────────────────────────┐
│ Progress                 │       │ Progress           Today Library Grammar …   │
│ 94 new · 257 learning ·  │       ├──────────────────────────────────────────────┤
│ 61 mature                │       │ 94 new      257 learning      61 mature      │
│ Due, next 14 days        │       │ Due, next 14 days        Quiz accuracy       │
│ ▂▅▃▇▂▁▂▃▅▂▁▃▂▁           │       │ ▂▅▃▇▂▁▂▃▅▂▁▃▂▁           ⟋⟍⟋ 84% average     │
│ Quiz accuracy · 84%      │       │ Moby-Dick      ▰▰▰▱▱ 38% · 122 kept          │
│ Moby-Dick   38% · 122    │       │ Workbook       ▰▰▰▰▰ done · 208 kept         │
│ Workbook    done · 208   │       │ Spend, jobs & backups →                      │
└──────────────────────────┘       └──────────────────────────────────────────────┘
```

**Responsive.** Stats row stays horizontal ≥360px (counts are short); charts stack on mobile, sit two-up at `bp-desktop`.

**States.**

- _Empty:_ counts read "0 new · 0 learning · 0 mature" with EmptyState invitation; charts render axes only, no fake data.
- _Loading:_ values render as em-dashes ≤300ms.
- _Error:_ per-section inline "Couldn't compute. Retry." — sections fail independently.
- _Overflow:_ >6 books: coverage list shows 5 + "All sources →" expanding in place.

---

