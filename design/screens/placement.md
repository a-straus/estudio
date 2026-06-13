> Screen spec — read together with `design/tokens.md`, `design/screens/shell.md`, and `design/components.md` (WordEntry, Button, ProgressStat, EmptyState). Composes existing components only; no new tokens or components.

### 3.10 English placement (level calibration)

**Purpose.** A short, **optional, one-time adaptive** English vocabulary check. It estimates the owner's English level and — its real job — **seeds the likely-known calibration baseline**: the known/mastered English words that every English classification batch (Gutenberg/KJV filtering, English suggestions) uses as calibration examples (GOAL §5 "English level calibration", §6.1 "likely-known calibration"). It exists so English filtering knows the owner's strong baseline *before* review history accumulates. Skippable and re-runnable; nothing here is required to use the app.

**Where it lives.** A normal screen at `/placement` with full chrome (SiteHeader + phone AppNav + SiteFooter) — it is setup, not a session takeover. Entry point: **System → Preferences** (see `screens/system.md` §3.9 region 5), a row "English level" whose quiet Button reads **"Calibrate"** when never run and **"Re-calibrate"** (with a mono "· ~C1 · 24 words" meta) once it has.

**Regions.** Single reading column.

1. _Intro_ (first card). One quiet sans sentence: *"Mark the English words you already know. About 20 words, a minute — it tunes which words the app tests you on."* Primary Button **"Start"**. Quiet "Maybe later" returns to System.
2. _Probe card_ (the run). One English word at a time, rendered as the standard `WordEntry` — **serif headword** (English literary vocabulary is the studied language → serif, principle D1.2), with the mono tag line `en · <part of speech> · <band>` and **no definition shown** (this is recognition, not study). The thumb zone (lower third, D1.6) holds two equal Buttons: **"I know this"** and **"New to me"** — the same binary self-grade shape as `ReviewCard`'s yesno mode (components.md), reused here, not reinvented. A mono meta line under the entry reports progress as a sentence (D1.5/D1.7): *"word 7 · narrowing your level"*. Tap or keyboard (`K` = know / `N` = new) advances immediately, no confirm.
3. _Result_ (final card). A mono verdict (the machine reporting, D1.7): *"Your English level · ~C1. Seeded 24 known words for calibration."* One quiet sans note: *"Words you marked known are in your English deck as known — they won't be re-tested. The rest weren't added."* Primary Button **"Done"** → System; quiet **"Run again"** restarts.

```
/placement — probe card (mobile; desktop is the same column, centered)
┌──────────────────────────────────────┐
│ English level        Today Library … │
├──────────────────────────────────────┤
│                                      │
│   propitiation                       │   ← WordEntry, serif headword
│   en · noun · C2                     │   ← mono tag line (no gloss)
│                                      │
│   word 7 · narrowing your level      │   ← mono progress meta
│                                      │
│ ──────────────────────────────────── │
│   [ I know this ]   [ New to me ]    │   ← thumb zone, two equal Buttons
└──────────────────────────────────────┘
```

**Adaptive flow (behaviour the builder implements; server-side).** Difficulty bands ascend **B2 → C1 → C2 → rare/archaic**. Start at **C1**. Serve a band of ~6 words; if the owner knows roughly ≥⅔, climb one band; if ≤⅓, descend; otherwise stop. Stop once a boundary is clear — at most ~4 bands / ~24 words total ("short"). The **level estimate** is the highest band where the owner knew the majority. Words marked **"I know this"** across all bands are the seed set.

**Seeding (what completion does).** On **Done**, every word marked known is written as a `status='known'` English word in the English Vocabulary deck, linked to a single `type='manual'` Source titled "English placement assessment" — so `buildCalibrationSample(db,'en')` reads them as calibration anchors. Unknown words are discarded (not added to study). Re-running dedupes against existing words by normalized lemma (the standard ingestion dedupe), so known words are not duplicated.

**Responsive.** One column everywhere; the probe card centers in the reading column at `bp-tablet`+, full-width with a bottom-pinned thumb zone below it (mirrors Review).

**States.**
- _Never run (first visit):_ the _Intro_ card.
- _Running:_ probe cards; progress meta updates per word.
- _Generating the next band:_ skeleton em-dashes in the entry slot with a mono "finding words…" line — the band's word list is generated, then cached and reused (GOAL §6.7 "never regenerate what is stored"), so a re-run or repeat band does not re-pay.
- _Done / already calibrated:_ the _Result_ card; the System row switches to "Re-calibrate · ~<band> · <N> words".
- _Generation error:_ "Couldn't fetch placement words — try again." Quiet Button "Retry"; abandoning seeds nothing (completion is atomic — nothing is written until Done).
- _Empty deck of candidates (all known):_ if the owner knows every word served up to the top band, the result states "~C2+ — strong baseline" and seeds what was marked.

**Identity.** Headwords serif, everything the app says (buttons, notes, progress, the level estimate) sans/mono; the level estimate and counts are mono (D1.7). Feedback is a quiet verdict, never a celebration (D1.4). No new tokens, no new component — `WordEntry` + `Button` + `EmptyState` skeletons, composed.

---
