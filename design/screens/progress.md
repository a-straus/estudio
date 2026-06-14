> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.8 Progress

**Purpose.** Honest mastery, no engagement theater.

**Regions.**

1. _Status counts_ — three `ProgressStat`s in a row: "94 new · 257 learning · 61 mature" — each a count + word, hairline-separated, no boxes.
2. _Due forecast_ — 14-day column chart, 4px `--radius-pill` bars in `--color-accent-wash` with `--color-accent` for today; y-axis unlabeled, max value annotated once in `--font-meta`.
3. _Quiz accuracy_ — simple line of last 20 sessions, `--color-ink-soft` stroke; current value as a sentence: "Last 20 sessions · 84% average".
4. _Book coverage_ — per-source rows: "Moby-Dick · 38% triaged · 122 words kept" with pill track.
5. _Grammar mastery_ — the honest heatmap of the curriculum. Per-category groups (category name leading each group in `--font-meta`); within a group, one small square cell per topic, tinted by mastery — `--color-accent` at the topic's mastery as opacity, over a `--color-accent-wash` track, with a `--color-rule` hairline; the topic name rides each cell as its `title`/`aria-label` (a tooltip, not a shouted number). One quiet legend line — "Less practiced → more" — in `--font-meta`. Reads the same `grammar_topic.mastery` the practice queue and the Home nudge already use. Honest mastery only: no percentages on the face, no badges, streaks, levels, or trophies (§3 — no engagement theater).
6. _Footer link_ — quiet link to System ("Spend, jobs & backups →").

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
│ Workbook    done · 208   │       │ Grammar  Tenses ▓▒░▓  Contrasts ░▒▓▒         │
│ Grammar ▓▒░▓ ░▒▓ ▒░▓     │       │ Less practiced → more                        │
│ ▒░▓ · less → more        │       │ Spend, jobs & backups →                      │
└──────────────────────────┘       └──────────────────────────────────────────────┘
```

**Responsive.** Stats row stays horizontal ≥360px (counts are short); charts stack on mobile, sit two-up at `bp-desktop`.

**States.**

- _Empty:_ counts read "0 new · 0 learning · 0 mature" with EmptyState invitation; charts render axes only, no fake data; grammar mastery reads a quiet "No grammar topics yet — seed the curriculum on Grammar." when none are seeded.
- _Loading:_ values render as em-dashes ≤300ms.
- _Error:_ per-section inline "Couldn't compute. Retry." — sections fail independently.
- _Overflow:_ >6 books: coverage list shows 5 + "All sources →" expanding in place.

---

