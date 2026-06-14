# REVIEW — review-11 (final pre-release audit)

**Range audited:** `git diff c0759c7..HEAD` — 63 files, ~2150 insertions, the 8
branches integrated since review-10 (word-select-to-add, guidance-surfacing,
progress-view, backup-export-ui, mochi-import-fixes, placement-climb-guard,
gutenberg-cost-estimate-headroom, text-retry-language-consistency), plus the
iter-165 `gutenberg_extraction`→sonnet cost decision.

**Test suite:** `bash check.sh` → **766 passed (766), 83 files, exit 0** (run in
this session). The error lines in the log are deliberate failure-path tests.

---

## VERDICT: SHIP-WITH-FIXES — 0 blockers · 1 should-fix · 4 nits

The surface built since review-10 is solid: the word-select-to-add reduction
stays in-scope (in-app rendered content only, no native selection), all adds
route through the existing `POST /api/words`, the guidance suppression logic is
correct and well-tested, backup/export is genuinely read-only, the mochi
lifecycle fix is correct, and the daily-touch session surfaces (Review/Quiz/
Triage) are provably untouched. The single should-fix is a documented-but-real
gap against GOAL §5; the rest are cosmetic.

---

## Should-fix

### S1 · Progress view ships without the grammar-mastery heatmap GOAL §5 lists
- **Where:** `shared/src/progress-api.ts`, `server/src/db/progress-queries.ts`,
  `web/src/screens/Progress.tsx`, and `design/screens/progress.md` (regions
  1–5) all omit it.
- **What:** GOAL §5 Phase-4 "Progress view" acceptance criteria enumerate
  *"counts by status, due forecast, quiz accuracy trends, per-book coverage,
  **grammar mastery heatmap**."* The shipped `ProgressSummary` has `counts`,
  `dueForecast`, `quizAccuracy`, `coverage` — there is **no grammar-mastery
  surface at all**. `design/screens/progress.md` was written with only those
  five regions, so the implementation faithfully matches the *design contract*
  — but the design contract itself dropped a GOAL §5 acceptance item without a
  recorded reduction decision for it (unlike word-select-to-add, which has an
  owner-approved escape hatch).
- **Why it matters:** This is the last gate before declaring *every user story
  shipped*. The grammar data already exists — `grammar_topic.mastery` is read by
  `getGrammarHome` and the overview's `whatNext` already sorts topics by it — so
  a heatmap is cheap, and progress is the natural home for it.
- **Fix:** Either (a) add a sixth Progress region — per-topic mastery rendered
  as a heatmap/row list off `grammar_topic.mastery` (reuse the existing
  `getGrammarHome` read) — or (b) if the owner accepts the reduction, record it
  in `DECISIONS.md` and `TODO-LATER.md` the way the word-select reduction was, so
  "all stories shipped" is honest. As-is it is an undocumented divergence from
  the §5 acceptance list.

---

## Nits

### N1 · TappableText keydown handler is redundant for a native `<button>`
- **Where:** `web/src/components/TappableText.tsx:52-57`.
- **What:** The word token is a real `<button type="button">`, which already
  activates `onClick` on both Enter and Space natively. The extra `onKeyDown`
  that also calls `activate()` on Enter/Space therefore **double-invokes
  `openQuickAdd` on Enter** (native click + manual handler both fire). It is
  harmless today only because `openQuickAdd` is idempotent (it sets modal state),
  but the handler is dead weight. Fix: drop the `onKeyDown` entirely (the button
  handles the keyboard map in D5 for free), or switch to the `role="button"` span
  variant the spec also allows if you want custom key handling.

### N2 · TappableText reduced-motion block is dead CSS
- **Where:** `web/src/components/TappableText.css:33-40`.
- **What:** The `@media (prefers-reduced-motion: reduce)` block only sets
  `transition: none`, but no `transition` is ever declared on `.tappable-text__word`,
  so the hover color change is already instant. The block is a no-op. Harmless,
  but it implies a transition exists that doesn't. Remove it (the spec's
  "instant under reduced-motion" is already satisfied by construction).

### N3 · TappableText default cursor is `text`, not `inherit`/`default`
- **Where:** `web/src/components/TappableText.css:11` (`cursor: text;`).
- **What:** Quiet-by-default words show an I-beam at rest, hinting "selectable
  text input" rather than ordinary prose; intent is signalled correctly only on
  hover (`cursor: pointer`). Minor; `cursor: inherit` reads more like the
  surrounding prose. The spec calls only for "no persistent decoration" on the
  resting state, which this otherwise meets.

### N4 · HomeNudge count not rendered in `--font-meta`
- **Where:** `web/src/components/HomeNudge.tsx:14` and `HomeNudge.css`.
- **What:** D4 §HomeNudge / home.md say the prompt sentence carries "any count in
  `--font-meta`". The "N words picked for you" sentence renders the count inline
  in `--font-app` (`.home-nudge__sentence`) with no meta span. Grammar topic
  names correctly stay app-sans (they are labels, per spec). Cosmetic; the
  suggestions branch is Phase-2-dormant (server pins `pool = 0`) so it cannot
  even render today.

---

## Clean bill — verified correct by reading the code

**Word-select-to-add (heaviest weight):**
- Stayed in the owner-approved **reduced** form: `TappableText` only ever wraps
  app-rendered reading content — `WordDetail` (gloss+example, via `tappable`),
  `Lesson` explanation+examples, `ChatTurn` assistant replies, and Ask. It never
  reaches for OS/native selection (§3 non-goal confirmed not crossed).
- The `tappable` prop on `WordEntry` is **default-false** (`WordEntry.tsx:55`)
  and is passed `true` in **exactly one place** — `WordDetail.tsx:124`. Grepped
  the session surfaces: `ReviewCard`, `Quiz`, `Triage`, `TriageRow` compose
  `WordEntry` with no `tappable`, and none of those files are in the diff →
  the Review/Quiz/Triage answering surfaces are provably unchanged.
- Adds go through the **existing internal API**: tap → `QuickAddContext.openQuickAdd`
  → `QuickAddModal` → `createWord` → `POST /api/words` (`libraryApi.ts:32`).
  No side path; satisfies GOAL §6.2.
- Prefill matches interaction.md "Tap-to-add": term pre-filled (punctuation
  stripped via `cleanToken`, accents preserved), language preselected per host
  run (es gloss→es, en gloss→en, ChatTurn per-line `SPANISH_CHARS`), both still
  editable; QuickAdd captures initial values via refs at open so a parent
  re-render can't clobber edits (`QuickAddModal.tsx:40-49`).
- Each host surface shows exactly one `--font-meta --text-xs --color-ink-faint`
  hint ("Tap a word to add it"), per surface not per word (WordDetail/Lesson/Ask
  CSS all use the right tokens). No raw hex/px where a token exists.
- `TappableText.test.tsx` genuinely asserts behavior (token split, punctuation
  strip vs display, accent retention, language pass-through, Enter/Space, no-op
  default provider) — not a smoke test.

**Guidance-surfacing (heavy weight):**
- `buildWhatNext` (`overview-queries.ts:137`) implements the spec priority and
  the **suppression gate** exactly: returns null while `due > 0` OR
  `pendingTriage > 0`; else weakest below-`0.5` topic by mastery then id; else
  suggestion pool > 0; else null. Pending-triage is a suppressor, not a
  recommendation kind — no `/triage` dead-link possible.
- Read-only: `getOverviewSummary` is pure SELECTs; HomeNudge only navigates or
  session-dismisses (`Home.tsx:249`, `nudgeDismissed` state) — never auto-adds.
- `overview.test.ts` covers all gates (due>0→null, pending-triage→null,
  weakest-topic pick, lowest-of-several, exhausted→null) with real DB rows.

**Progress-view:** due-forecast SQL is a correct 14-day recursive calendar
left-joined to `card_state`; quiz accuracy parses `quiz_attempt.answers`
`{correct}[]` per ARCHITECTURE; coverage uses the existing `getSourceCoverage`;
per-section independent error/loading/empty states match progress.md; tokens
used throughout; >6-sources overflow ("All sources →") handled.

**Backup-export-ui:** `GET /api/system/export` is SELECT-only over all
non-`sqlite_%` tables → attachment download (non-destructive, GOAL §6.8 satisfied);
`GET /api/system/backup/download` 404s cleanly when no backup exists; System UI
adds Export/Download buttons without touching the existing backup flow.

**Mochi-import-fixes:** B1 fixed — imported cards now `status:'new'` with no
`card_state` (`mochiImport.ts:159`), so the review-queue promoter creates
`card_state` exactly per the ARCHITECTURE word lifecycle (was the orphaned
`'learning'`-without-card_state class of bug). S1 — `malformed` counted and
surfaced through `ParsedMochi`/`ImportMochiResult` (GOAL §16, nothing dropped
silently). `mochiImport.test.ts` asserts both.

**Placement-climb-guard:** the climb branch now mirrors the descend branch's
already-visited guard (`adaptive.ts:51-57`) — re-visiting a higher band
terminates with `estimateLevel` instead of looping; stray `;;` removed.

**Gutenberg cost / sonnet swap:** estimate constants recalibrated to err high
(opus KJV real run $7.41); `estimateGutenbergCostUsd` prices the **resolved**
`gutenberg_extraction` model (`sources.ts:108,414`), so estimate tracks the
actual run model. The iter-165 swap to `claude-sonnet-4-6` is config-level
(within GOAL §13 autonomy), brings the full KJV to ~$4.45 (genuinely under the
$5 confirm gate), pinned to a literal (not `FABLE_REPLACEMENT`) as an intentional
standing cost decision, and is logged in DECISIONS (iter 165). Word-definition /
quiz-cloze correctly keep `FABLE_REPLACEMENT` (opus). Classification still feeds
human triage (triage *is* the check, §16), so accuracy doesn't ride on the swap.

**Text-retry-language-consistency:** the text-page retry reads the persisted
`source.language` (migration 005) instead of re-detecting (`sources.ts:533`), so
a retry cannot diverge from the language chosen at enqueue.

**Routing note (not a finding):** HomeNudge's `window.location.assign` and
Progress's `<a href>` are full-page navigations — but that is the app's
deliberate routing model (App.tsx routes on `window.location.pathname`, no
react-router), and matches `Home.tsx`'s own `go()` helper. Consistent, not a bug.
</content>
</invoke>
