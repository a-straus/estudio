> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.3 Quiz

**Purpose.** Deliberate practice beyond what's due: configure → play → results.

**Regions — Setup.** A single form column (max 480px): SegmentedControl "Deck" (Spanish / English / All), SegmentedControl "Length" (10 / 20 / 40), SegmentedControl "Style" (Multiple choice / Cloze / Mixed), SegmentedControl "Direction" (Word → definition / Definition → word / Mixed), primary Button "Start quiz".

**Regions — Play.** Identical components to Review (same `ReviewCard`, `QuizOption`, session bar). Differences: progress reads "Q 4 of 20"; no spaced-repetition writeback; "Don't know" counts as wrong.

**Regions — Results.** Score line "17 of 20" (`--text-2xl`); per-question list: each row a compact `WordEntry` + your answer vs. correct answer (incorrect rows tinted `--color-incorrect-wash` rule-left none — tint on the row background only), "Explain why" per row; primary Button "Done", quiet "Retake missed".

```
Mobile — setup                     Desktop — results (≥960px, 680px col)
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│ Quiz                     │       │ 17 of 20                             │
│ Deck   [ES] [EN] [All]   │       │ ──────────────────────────────────── │
│ Length [10] [20] [40]    │       │ lugubrious  ✓                        │
│ Style  [MC] [Cloze] [Mix]│       │ perspicacity ✗  yours: stubbornness  │
│ Direction [W→D] [D→W] [M]│       │   correct: keenness of insight       │
│                          │       │   [Explain why]                      │
│ [     Start quiz      ]  │       │ …                                    │
│ Today Library Gram Prog  │       │ [Done]  [Retake missed]              │
└──────────────────────────┘       └──────────────────────────────────────┘
```

**Responsive.** Setup segments wrap to two rows below 400px. Play matches Review responsiveness. Results rows: answers stack under the entry on mobile, sit in a right column at `bp-desktop`+.

**States.**

- _Empty (no deck content):_ setup disabled with EmptyState "No words yet. Ingest something first."
- _Loading (generating questions):_ JobStatus inline under the Button — "Writing questions… 12 of 20" — Button disabled. Play begins only when all questions exist.
- _Error (generation fails):_ JobStatus error line "Couldn't write questions. Try a shorter quiz, or retry." + retry.
- _Overflow:_ cloze options that are full sentences wrap at `--leading-snug`; results list virtualizes beyond 40 rows.

---

