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
| `screens/shell.md` | global chrome: SiteHeader (masthead + nav), AppNav bottom bar, session takeover, SiteFooter, page defaults | tasks that build or change a screen |
| `screens/<screen>.md` | one per screen: home, today, review, quiz, ingest, triage, library, grammar, progress, system, lessons, ask, suggestions | only the screen(s) the brief names |
| `components.md` | D4 — WordEntry, ReviewCard, QuizOption, TriageRow, WordDetail, ProgressStat, JobStatus, Toast, Button, TextInput, SegmentedControl, EmptyState, ChatTurn, ToolConfirm, RecordButton, InsightRow, SiteHeader, SiteFooter, HomeHero, OverviewCard | tasks that build or compose components |
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
- 2026-06-11 — Phase 2 extension (closes the 2026-06-10 known gap): new screens/lessons.md (lesson-recording insights: flagged words, corrections, struggle sentences, topics, transcript), screens/ask.md (persistent context-seeded chat, inline tool confirmation, voice questions in the composer), screens/suggestions.md (one-at-a-time word/topic proposals, add/skip, never-repeat). New D4 components: ChatTurn, ToolConfirm, RecordButton, InsightRow. Shell: Ask button rule (plain quiet Button, never floating; masthead on mobile, rightmost top-bar item at bp-tablet+) + Lessons/Suggestions in desktop nav. Ingest: Lesson audio method tab with upfront cost estimate. System: transcription spend as its own line. Grammar: topic meta gains "seen in N lessons" linking to insights. Interaction: A/S and Ask Enter keys + full Phase 2 microcopy block. No new tokens — recording indicator reuses --color-incorrect; chat uses existing type/space tokens.
- 2026-06-10 — Arch-critique reconciliation: quiz Play spec corrected — misses DO write SRS failures and pull the card due now; only correct answers skip writeback (was "no spaced-repetition writeback", which contradicted the GOAL quiz Must) (screens/quiz.md). Delete-confirm microcopy corrected to "Its card and schedule go with it" — review history is retained per GOAL/architecture (interaction.md, components.md, screens/library.md).
- 2026-06-11 — **Design polish (authorized iter 55; identity D0/D1 unchanged).** merriam-webster.com adopted as a *structural* reference only (slim masthead, content spine, quiet utility footer, single homepage centerpiece) — never its look. (1) New `screens/home.md`: `/` is now a navigable overview, not a working screen — a HomeHero centerpiece (the day's word as the app's largest dictionary entry), an OverviewCard grid of entry points stated as sentences, and a quiet activity band. (2) `screens/shell.md` rewritten: SiteHeader (sticky name-agnostic masthead + nav, screen title left), bottom AppNav reduced to Home · Review · Library · Grammar, and a new SiteFooter (utility links, live-count meta line, theme toggle). (3) tokens.md — additive only (no renames; existing code/in-flight workers unaffected): `--text-display`, `--leading-display`, `--tracking-display`; `--space-9/-10`; `--shadow-3`; `--color-paper-sunken`, `--color-accent-strong`; `--header-height`; `--motion-slow` (+ dark overrides). Display-size headwords now take `--tracking-display`; accent hover names `--color-accent-strong`. (4) components.md — new SiteHeader, SiteFooter, HomeHero, OverviewCard; Button primary hover → `--color-accent-strong`. Per-screen sweeps to adopt the elevated chrome are queued as backlog after the foundation lands.
- 2026-06-12 — Iteration 89, FEEDBACK-driven (mobile nav + "/review navbar disappears"). `screens/shell.md` Session-takeover section clarified: the takeover is the **active run** only; a session route's resting states (pre-session landing, empty, finished/summary) are ordinary non-session screens with full chrome (SiteHeader + phone AppNav + SiteFooter) so the user is never stranded — mirrors the shipped Quiz config→play pattern, now applied to Review and Triage. No token or component changes: AppNav and the phone bottom-bar nav were already specified in shell.md; the iteration-89 `mobile-nav-and-review-landing` task builds AppNav, which `home-nav-footer` had left unbuilt.
