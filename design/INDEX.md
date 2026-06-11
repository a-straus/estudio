# Design contract — Personal Learning App

> Build-ready specification for a single-user, AI-assisted study tool.
> Stack contract: React + Vite, plain CSS, every value below is a CSS custom property.
> The app is name-agnostic: no logotype appears on any screen. The masthead is the screen title.

This directory is the design contract (the UI peer of ARCHITECTURE.md). It
has one writer — the orchestrator — and is split into files so a task loads
only the sections it needs: worker briefs name the specific files that
apply, and workers read those and nothing else here.

## Files

| File | Contents | A task reads it when |
|---|---|---|
| `INDEX.md` | identity (D0), principles (D1), this map, the Change log | every UI task (always) |
| `tokens.md` | D2 — all design tokens, breakpoints, token-usage rules | every UI task (always) |
| `screens/shell.md` | global chrome: AppNav, session takeover, page defaults | tasks that build or change a screen |
| `screens/<screen>.md` | one per screen: today, review, quiz, ingest, triage, library, grammar, progress, system | only the screen(s) the brief names |
| `components.md` | D4 — WordEntry, ReviewCard, QuizOption, TriageRow, WordDetail, ProgressStat, JobStatus, Toast, Button, TextInput, SegmentedControl, EmptyState | tasks that build or compose components |
| `interaction.md` | D5 — answer-feedback choreography, keyboard map, thumb-zone rules, bilingual typography rules, final microcopy strings | session/interaction work and any user-facing strings |
| `mockups.md` | D6 — reference HTML mockup list | a listed mockup covers the task's screen |

Once the design foundation has landed in code, the token stylesheet and the
component sources are the ground truth for HOW things are built; these
files remain the ground truth for WHAT to build (screens, states, strings).

---

## 0 — Design identity: The Entry

The visual identity is **the dictionary entry**. Every vocabulary word in the app — on a review card, in a triage row, in the library — is set as the same typographic object (`WordEntry`): bold serif headword, a small monospaced tag line (language · part of speech · level), a sans-serif gloss, and a hanging-indented serif-italic example. Hairline rules divide entries like a dictionary column.

The entry object and its hanging indent are the one expressive element. Everything around it is disciplined: one accent color, hairline rules, small radii, motion only on answer feedback. Chrome, buttons, and status are plain sans so the entries read as the only content on the page. The product feels like a fine dictionary that quizzes you back — never like a game.

---

## D1 — Design principles

1. **One object, everywhere.** A word is always rendered as the same dictionary entry (`WordEntry`); review, triage, quiz, and library are different frames around the same object — never different typography.
2. **Serif is the studied language; sans is the app.** If text is _in_ Spanish or _from_ literature — headwords, example sentences, quotations, cloze stems — it is serif. If the app is _talking to you_ — definitions-as-gloss, buttons, labels, status — it is sans. The eye learns this in one session and never has to read a flag icon.
3. **Hairlines, not boxes.** Entries and rows are separated by 1px rules, like a dictionary column. Cards (elevated surfaces) are reserved for the one active object on screen — the current review card, the current triage row.
4. **Feedback is a verdict, not a celebration.** Correct and incorrect are stated once, in color and words, within 150ms, and then get out of the way. Nothing bounces.
5. **Counts are sentences.** Numbers always appear with their honest unit in plain words — "23 due today," "412 words · 61 mature" — set in the mono tag style. No big-number dashboard tiles.
6. **The thumb owns the bottom 30%.** On mobile, every action a session requires lives in the lower third; the upper two-thirds is for reading only.
7. **The machine reports in mono.** Anything generated, running, or costing money (jobs, spend, provenance, level estimates) is tagged in the monospace meta style — visible, quiet, never colored unless failing.

---

**Consistency rule.** `tokens.md` (D2) is the single source of truth: every
visual value in the other design files and in implementation references a
token by name — never a raw value where a token exists. Genuinely new needs
become new tokens, added to tokens.md (+ Change log here) as they land, so
this contract and the product never drift more than one iteration apart.

## Change log

- 2026-06-10 — Split the single DESIGN.md into this directory (content unchanged: D2 → tokens.md, D3 → screens/, D4 → components.md, D5 → interaction.md, D6 → mockups.md) so each task loads only the sections it needs.
- 2026-06-10 — Synced to GOAL v2 Phase 1 scope: lemma beside the encountered form (WordEntry); dual es/en definition lines with a reveal preference (WordEntry, ReviewCard flip-back, System → Preferences); likely-known groups with per-group bulk actions (Triage); "I forgot this" on rows and detail (Library, WordDetail); practice queue on the Grammar home; curriculum wording corrected to AI-seeded; "OCR" microcopy replaced with vision-pipeline wording (Ingest, System, D5 table).
- 2026-06-10 — Known gap, deliberate: Phase 2 surfaces (Ask chat, Suggestions, lesson-audio ingest, voice questions, transcription spend on System) are not yet specified. The orchestrator extends this contract when Phase 2 approaches; do not treat their absence as a non-goal.
- 2026-06-10 — Arch-critique reconciliation: quiz Play spec corrected — misses DO write SRS failures and pull the card due now; only correct answers skip writeback (was "no spaced-repetition writeback", which contradicted the GOAL quiz Must) (screens/quiz.md). Delete-confirm microcopy corrected to "Its card and schedule go with it" — review history is retained per GOAL/architecture (interaction.md, components.md, screens/library.md).
