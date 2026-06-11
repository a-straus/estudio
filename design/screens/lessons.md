> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.10 Lessons

**Purpose.** What the tutor lessons taught: browse each recording's mined insights — flagged words, corrections, struggle sentences, topics covered — and get to its transcript. Upload lives on Ingest (Lesson audio tab); this screen is for reading the results.

**Regions.**

1. _Lesson list_ — hairline-separated rows, newest first: date + duration as the title line (`--font-app` `--text-base`, "Lesson · Jun 9 · 58 min"), beneath it a `--font-meta` `--text-xs` summary ("4 flagged words · 6 corrections · 3 topics"). A still-processing lesson shows a `JobStatus` row in place of the summary ("Transcribing… 12 of 58 min · $0.08 so far").
2. _Lesson detail_ — reading column, max `--measure-reading`, four hairline-separated sections, each under a `--font-meta` uppercase header:
   - `FLAGGED WORDS` — each as `WordEntry size=compact` with its triage status stamp (`--font-meta`: IN TRIAGE / LEARNING / KNOWN). These flow through standard triage; this list is provenance, not a second triage.
   - `CORRECTIONS` — `InsightRow kind=correction` per item (anatomy in components.md): your version, then the tutor's.
   - `STRUGGLE SENTENCES` — `InsightRow kind=struggle` per item; best-effort, section hidden when empty.
   - `TOPICS COVERED` — topic name rows linking to Grammar, each with a quiet Button "Open topic".
3. _Transcript_ — collapsed by default behind a quiet Button "Show transcript"; expands to the full stitched transcript, `--font-study` `--text-md` `--leading-loose` (it is studied-language speech), speaker turns separated by `--space-4`, no bubbles.

```
Mobile — detail                     Desktop — list + detail (680px column)
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│ ← Lesson · Jun 9 · 58min │       │ Lessons        Today Library … Ask   │
│ 4 FLAGGED WORDS          │       ├──────────────────────────────────────┤
│ entender — IN TRIAGE     │       │ Lesson · Jun 9 · 58 min              │
│ ──────────────────────── │       │ 4 flagged · 6 corrections · 3 topics │
│ 6 CORRECTIONS            │       │ ─────────────────────────────────────│
│ you  Yo fui ayer en…     │       │ Lesson · Jun 2 · 61 min              │
│ tutor Yo fui ayer a…     │       │ ● Transcribing… 12 of 61 min         │
│ ──────────────────────── │       │ ─────────────────────────────────────│
│ 3 TOPICS COVERED         │       │ Lesson · May 26 · 55 min             │
│ Subjuntivo  [Open topic] │       │ 2 flagged · 9 corrections · 2 topics │
│ [ Show transcript ]      │       │                                      │
└──────────────────────────┘       └──────────────────────────────────────┘
```

**Responsive.** List and detail are separate views on mobile; at `bp-desktop`+ the detail opens in place below the selected row (accordion), keeping one column — no master-detail split.

**States.**

- _Empty:_ EmptyState — "No lessons yet. Upload a recording from Ingest." → quiet Button "Go to Ingest".
- _Processing:_ list row carries the JobStatus (transcription, then analysis: "Mining the transcript…"); detail unavailable until analysis completes — tapping the row opens System-style progress, not a half-empty detail.
- _Error:_ row summary line becomes the JobStatus failed variant ("Transcription failed at minute 12. Retry resumes from there.") with quiet "Retry" — chunked jobs resume, never restart.
- _Overflow:_ an hour of conversation mines long lists — sections cap at 10 items with "All 23 →" expanding in place; transcript is fully scrollable once expanded.

---
