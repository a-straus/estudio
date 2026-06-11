# Review #2 — integrations since review-01

Date: 2026-06-11 · Branch: `review-02` · Reviewer scope: the five integrations
that landed after review-01, audited against GOAL.md, ARCHITECTURE.md, and the
design contract in `design/`.

Diffs audited (merge → content commit):

1. **srs-api-wiring** — `cbfd388` → `24b7a13` (routes/srs.ts, db/srs-queries.ts, shared/src/srs-api.ts)
2. **triage-ui** — `eb2f2e5` → `bc44b2f` (routes/triage.ts, db/triage-queries.ts, shared/src/triage-api.ts, web/src/screens/Triage.*)
3. **review-01-fixes** — `20b11ca` → `b39f58b` (migration 002, errorHandler, nowIso, TriageRow/WordEntry/Button CSS)
4. **pdf-ingestion-live-validation** — `1cf57c3` → `2591a70` (prompts/pdf_extraction.md, llm/prompts.ts, llm/service.ts, jobs/pdfIngestion.ts, scripts/validate-ingestion.ts)
5. **review-ui** — `56a4e7a` → `69cd422` (web/src/screens/Review.*, reviewApi.ts, App.tsx)

Plus the orchestrator's direct commits `1262d9c`, `1c966e5`, `667bbdc`
(route/type stubs, Library/Ingest placeholders, App routes, LLM task defaults).

Verification done in this session: `bash check.sh` green at HEAD (typecheck +
build + **200/200 tests**), plus a live repro script for finding 1 (output
quoted below). Every finding cites code actually read; nothing speculative.

---

## Findings

### 1. BLOCKER — batch confirm 500s and rolls back on duplicate terms; dedupe misses homographs

**Files:** `server/src/db/triage-queries.ts:294-327` (confirmBatch),
`server/src/db/triage-queries.ts:197-214` (findExistingWord),
`server/src/jobs/pdfIngestion.ts:240-275` (no within-source candidate dedupe).

**Contract:** GOAL §16 edge cases — "Duplicate words across sources
(merge/skip with report, **never silent**)"; GOAL §6.1 "duplicates surfaced,
never silently dropped"; ARCHITECTURE `word` — "UNIQUE(term, language)
exact-match only … Lemma-based dedupe is an ingestion-time *check* whose hits
are surfaced in triage for a human merge/keep decision"; quality bar — "Errors
are surfaced to the UI and logs, never swallowed."

**What the code does:** `confirmBatch` detects collisions only by querying the
`word` table on `lemma_normalized` *before* the insert transaction. Two cases
slip through and hit `UNIQUE(term, language)` mid-transaction, which throws,
rolls back the **entire** batch confirm, and surfaces as a generic
`500 internal_error` (no handler in `routes/triage.ts:125-151`):

- **(a) Within-batch duplicates.** The same word extracted on two pages of one
  source lands as two `extraction_item` rows in the same batch
  (`insertExtractionItems` does no within-source dedupe, and confirm-time
  detection only looks at `word`, not at the other items being materialized).
  Both pass the pre-check; the second INSERT violates the constraint.
- **(b) Homographs.** A candidate whose **term** matches an existing word but
  whose **lemma** differs (real Spanish case: *como* lemma *comer* vs existing
  *como* lemma *como*) is missed by the lemma-only lookup; the INSERT then
  violates UNIQUE(term, language). (`resolveDedupe` "keep" guards exactly this
  with `term_taken` at triage-queries.ts:364-369 — `confirmBatch` has no such
  guard.)

Reproduced live against this tree (tsx script driving `confirmBatch` on a
migrated temp DB):

```
confirm THREW: UNIQUE constraint failed: word.term, word.language
words now: { c: 0 }                      ← whole batch rolled back
homograph confirm THREW: UNIQUE constraint failed: word.term, word.language
```

**Impact:** the Phase-1 Must triage flow wedges. The user taps "Keep N words",
gets "Internal server error", and retrying is deterministic — there is no UI
path to discover *which* item collides. No data is lost (rollback), but the
batch cannot be confirmed.

**Suggested fix:** inside `confirmBatch`, (i) pre-check exact
`(term, language)` collisions against `word` the same way `resolveDedupe`
"keep" does and route them into `dedupeHits`; (ii) detect duplicates *within*
`toMaterialize` (by normalized lemma and by exact term) and surface all but the
first as `dedupeHits` (or materialize one and link the rest). Add route tests
for both cases. Optionally also dedupe candidates within a source at
`insertExtractionItems` time (surfaced, not dropped).

### 2. SHOULD-FIX — review action region is not fixed to the thumb zone

**File:** `web/src/screens/Review.css:97-104` (`.review__actions`), comment at
`Review.css:12` ("Leave room for the fixed action region on phones").

**Contract:** design/interaction.md thumb-zone rules — "the action region is
`position: fixed`, background `--color-paper`, top hairline `--color-rule`";
design/screens/review.md overflow state — "action region **never moves
off-screen**"; D1 principle 6.

**What the code does:** `.review__actions` is a normal flex child with
`margin-top: auto` inside a `min-height: 100vh` column — nothing is
`position: fixed` (the file's own comment claims otherwise). With four long
definition options plus the post-answer reveal (the overflow state the spec
calls out), Check/Next scroll off-screen on a phone. Triage got this right
(`Triage.css:69-81`, fixed footer).

**Suggested fix:** make `.review__actions` `position: fixed; bottom: 0` below
`bp-desktop` with `--color-paper` background and top hairline, and let the card
region scroll under it, per D5.

### 3. SHOULD-FIX — demote endpoint can't serve "I forgot this" for words without a card

**File:** `server/src/routes/srs.ts:149-158` (409 `no_card_state`).

**Contract:** GOAL §6.2 — "**'I forgot this' action on any word**: card becomes
due immediately; SM-2 interval reset and ease demoted one step"; GOAL §5
Library Must — "the 'I forgot this' resurface action is available on every
row." ARCHITECTURE's lifecycle gives `known` words (triage "know") and `new`
words **no card_state**.

**What the code does:** `POST /api/words/:id/demote` 409s when no card_state
exists. So for exactly the words the override is most useful on — a word
triaged "know" that the owner then realizes they *don't* know — the API refuses.
The library-ui task (in flight) cannot satisfy its Must story with this
endpoint as-is.

**Suggested fix:** when no card_state exists, create one (due = now,
interval 0, ease `INITIAL_EASE − 0.15`, reps 0), flip the word to `learning`,
and append the `manual_demotion` log row — same outcome the GOAL describes.
(Or document explicitly that library-ui must add this; today it's just a 409.)

### 4. SHOULD-FIX — "Keep N words" count and confirm summary include known-archived words

**Files:** `web/src/screens/Triage.tsx:501-503` (button), `Triage.tsx:369`
(summary).

**Contract:** design/screens/triage.md batch-complete state — "footer becomes
the confirm: 'Keep **24** words · **7** known archived · **19** skipped' +
primary 'Keep 24 words'" (24 + 7 + 19 = 50: the kept count **excludes** known);
microcopy table "Keep 24 words (count always live)".

**What the code does:** the button renders `Keep {tally.know + tally.learn}
words`, and the summary renders `Kept {summary.materialized}` where
`materialized` = learn + know rows created (`ConfirmResponse` docs,
shared/src/triage-api.ts). A 50-item batch with 19 learn / 7 know / 24 skip
shows "Keep 26 words" then "Kept 26 words · 7 known archived · 24 skipped" —
the 7 known are counted twice and "kept" overstates what enters the deck.

**Suggested fix:** button label `Keep {tally.learn} words`; summary
`Kept {summary.learn} words`.

### 5. SHOULD-FIX — group bulk action silently overwrites individual unconfirmed decisions

**Files:** `server/src/db/triage-queries.ts:170-195` (bulkDecision),
`web/src/screens/Triage.tsx:426-446` (label uses `decidedAt === null` count).

**Contract:** design/screens/triage.md — "each header carries a quiet
per-group bulk Button ('Learn all 18' / 'Know all 9'), undone as one step";
the spec's 18/9 are the *group* counts, so applying to the whole group is a
defensible reading — but GOAL's triage principle is that explicit human
decisions are never silently changed.

**What the code does:** `bulkDecision` updates every item with
`decided_at IS NULL` in the group regardless of its current decision, and the
button's count (`pendingInGroup` = unconfirmed, not undecided) doesn't shrink
as you decide items. Sort 5 of 18 as Know by hand, then tap "Learn all 18":
your 5 Know decisions silently flip to Learn. Undo does restore all 18 as one
step (good), but only if the user notices.

**Suggested fix:** scope the bulk update to `decision = 'pending'` items and
label the button with that count ("Learn all 13") — the spec's intent is "deal
with the rest of this group at once," not "override my work."

### 6. SHOULD-FIX — "I forgot this" added to the review screen, in the thumb zone, with no confirm or undo

**File:** `web/src/screens/Review.tsx:275-277` (choice mode) and `205-211`
(flip mode); handler at `Review.tsx:356-373`.

**Contract:** design/screens/review.md region 4 — pre-answer actions are
exactly "quiet Button 'Don't know'"; GOAL §5 puts the manual resurface
override on "the library list"; design gives it to Library rows and WordDetail.
D5: "Destructive or rare actions … are placed **outside** the thumb zone
deliberately."

**What the code does:** an extra quiet "I forgot this" button sits in the
review action region (the thumb zone), directly under "Don't know". One stray
tap demotes the card (ease −0.15, manual_demotion logged in the append-only
review_log — not undoable by design) and skips the card without grading it.
It's also redundant during review: grading "Don't know" already records the
failure and resets the interval.

**Suggested fix:** drop the button from the review screen (keep the
`demoteWord` API client for Library), or at minimum move it out of the action
region and confirm before demoting.

### 7. SHOULD-FIX — flip fallback driven by session-queue size, not deck size

**File:** `web/src/screens/Review.tsx:49-73` (`buildChoiceOptions` draws
distractors only from the current due queue).

**Contract:** GOAL §6.3 — "multiple-choice by default (distractors from same
**deck** …); flip-card self-grade fallback when the **deck** has <4 cards or no
cached question exists."

**What the code does:** distractors come only from other items in today's due
queue. A session with 1–3 due cards on a 500-word deck silently degrades to
flip-card mode even though the deck could fill four options. (The cached
LLM-cloze mix-in is also absent — expected, quiz generation isn't built yet;
recorded here so it isn't lost.)

**Suggested fix:** when the queue can't supply 3 distinct distractors, fetch
distractors from the deck (small API addition or include spares in the due
response) before falling back to flip.

### 8. SHOULD-FIX (known phase gap) — "Explain why" absent from the review screen

**File:** `web/src/screens/Review.tsx:279-291` (post-answer region renders
verdict + Next only).

**Contract:** design/screens/review.md region 4 — "After answering: verdict
line + 'Explain why' quiet Button + primary 'Next'"; D5 keyboard map key `E`;
explain-failure microcopy.

**What the code does:** no Explain why, no `E` key. This is presently
unbuildable — explanations live on cached `quiz_question` rows and quiz
generation doesn't exist yet — so this is sequencing, not a defect. Recording
it so the quiz-generation task knows the review screen owes this affordance.

---

## Nits

- **N1.** `web/src/screens/Review.tsx:69` — correct MC option always lands at
  slot `wordId % 4`, fixed for that card *forever*; positions are memorizable
  across sessions and the three distractors are taken in queue order (adjacent
  cards share option pools). Shuffle per render instead.
- **N2.** Mixed timestamp precision: `nowIso()` is second-precision (db.ts:18,
  per review-01 fix), but srs code stamps ms-precision via raw `toISOString()`
  — `routes/srs.ts:65`, `srs/sm2.ts` (`due_at`, `ts`), `db/srs-queries.ts`
  promotion stamps. All valid ISO-8601 UTC and internally consistent for the
  `due_at <= now` comparison, but the convention's canonical format
  (`2026-06-10T12:00:00Z`) is now only half-followed.
- **N3.** `routes/srs.ts:31-33` — manual demotions log `direction: 'w2d'`
  because `review_log.direction` is NOT NULL. A recompute from the log can
  still distinguish via `origin`, but the stored direction is a fiction; worth
  a gated nullable-direction (or `'n/a'`) when the schema is next touched.
- **N4.** `db/srs-queries.ts:43-51` — comment says "falling back to 20 when
  unset or unparseable" but `JSON.parse` is uncaught (garbage in `setting`
  → 500). Same pattern in `llm/service.ts` `resolveTaskConfig`.
- **N5.** New-card promotion budget is counted **per deck**
  (`countPromotedToday` filters by deck) — with both v1 decks active that's up
  to 40/day total against a GOAL default of 20/day. Defensible reading; note it
  in DECISIONS.md when library/English work starts.
- **N6.** `web/src/screens/Triage.css:57-66` — `.triage__bulk { min-height: 0 }`
  strips the Button's 44px floor on mobile; the computed height (~45px) only
  survives via padding, and the duplicate rule inside the `bp-desktop` media
  query is dead code.
- **N7.** `ApiError` + the `api()` fetch helper are copy-pasted between
  `reviewApi.ts` and `triageApi.ts`; third copy incoming with library-ui.
  Hoist to one shared client module.
- **N8.** `Review.css:58` — progress track `block-size: 2px` is a raw value;
  no thickness token exists (spec says "hairline"), so this is acceptable
  extrapolation, but if 2px rules recur a token should land in tokens.md.
- **N9.** `Review.tsx:82`/`Triage.tsx:40` — WordEntry `language="ES"`
  hardcoded. Documented and dispositioned for triage (`LANGUAGE = 'es'`,
  review-01 finding #5 → raw-text-ingestion brief), but the review screen
  accepts any `?deck=` id and would tag English-deck cards "ES". `DueQueueItem`
  carries no language field — add it when the English deck becomes real.
- **N10.** Triage batch header has no progress fill bar (both mockups show
  one under the header); only the "N of M sorted" meta line is rendered.
- **N11.** `resolveDedupe` "merge" (`triage-queries.ts:357-362`) only links
  `extraction_item.word_id` to the existing word — the candidate's definition/
  example is discarded rather than appended as an extra sense (GOAL §16:
  "additional senses appended"). Acceptable v1 minimalism; record the gap.
- **N12.** After resolving dedupe hits, the summary screen
  (`Triage.tsx:365-381`) still shows the pre-resolution counts — words kept via
  "Keep both"/merge aren't reflected.

---

## Checked and found CLEAN

**SM-2 wiring (srs-api-wiring) vs ARCHITECTURE/GOAL:**
- Grade→quality map fail/good/easy = 2/4/5; ease formula with floor 1.3;
  intervals 1/6/round(prev×ease); fail resets reps and interval; maturity at
  interval ≥ 21d with promotion *and* demotion of `word.status`
  (`srs/sm2.ts`, exercised through the routes by `routes/srs.test.ts`).
- Manual demotion: due now, interval 0, reps 0, ease −0.15 floor 1.3, origin
  `manual_demotion`, grade `fail` — exactly the ARCHITECTURE convention.
- `review_log` is append-only in every new code path (INSERT only), written
  atomically with the card_state/word updates (`persistReviewOutcome`
  transaction).
- Promotion: up to `new_cards_per_day` from `setting` (default 20), persisted
  card_state + status flip in one transaction, day-counted by UTC date,
  deterministic at session start (no cron), due-cards-oldest-first then
  promotions — matches the `word` lifecycle in ARCHITECTURE verbatim.
- Per-card direction randomly assigned server-side (`rng` injectable,
  deterministic tests) — matches design/screens/review.md "randomized
  direction" and GOAL §6.3.
- Error shape `{ error: { message, code } }` with correct 400/404/409 codes
  everywhere; no 200-with-error. camelCase JSON mapped at the query layer;
  no SQL outside `/server/src/db/`.

**Triage backend vs ARCHITECTURE/GOAL:**
- Lifecycle: learn → `word.status 'new'` with **no card_state**; know →
  `'known'` with no card_state; pending items never become words; skips get
  `decided_at` only. Confirm is one transaction.
- Dedupe accent rules: `normalize()` = lowercase + NFD accent-strip (tested
  incl. `más`→`mas`, `ñ` preserved as `n`? — test suite covers the contract
  cases); lookup on indexed `lemma_normalized`, constraint exact
  `UNIQUE(term, language)` — the ARCHITECTURE split is implemented correctly
  for the cross-batch case: a later batch's collision is surfaced as a
  `dedupeHit`, never auto-merged or dropped (route test asserts this), and
  "keep" guards exact-term clashes with 409 `term_taken`. (Within-batch and
  homograph gaps are finding 1.)
- already_confirmed / batch_incomplete / invalid-input failure modes all
  handled and tested (17 route tests).

**review-01-fixes:**
- Migration 002 rebuilds `quiz_question` preserving ids/rows with
  `CHECK ((word_id IS NULL) <> (topic_id IS NULL))`; both-null and both-set
  rejected, either accepted (migrate.test.ts); the FK-safe copy-out/recreate
  approach is sound under the runner's transaction. Pre-migration backup
  confirmed live in this session (repro run logged "db backup written before
  migration run").
- Multer `LIMIT_FILE_SIZE` → 413 `file_too_large`; the "max 50 MB" message
  matches the actual `MAX_UPLOAD_BYTES` (sources.ts:22); other errors still
  logged + 500.
- `nowIso()` second-precision matches the SQL `strftime` DEFAULT, tested.
- TriageRow retry: 44px `::before` overlay below bp-tablet; WordEntry hero
  scales at 640px per D4 glossary; Button busy defaults to label + "…" and
  disables — all as dispositioned in DECISIONS.md.

**pdf-ingestion-live-validation:**
- `word_id` stays NULL on pending extraction rows (contract: set only at
  confirm) — test updated to assert it.
- `{{calibration_sample}}`: filled at the call site from up to 20 known/mature
  es words, clean empty-state fallback string (GOAL §6.1 calibration); the
  prompt_version hash covers the **raw** template, never the filled text
  (ARCHITECTURE: prompt_version = template file content hash) — tested.
- `extractJson` strips only leading/trailing fences; inner backticks preserved
  (tested). Model output is `JSON.parse`d only — no eval.
- Per-page failure isolation (status/error on `source_page`), resume skips
  done pages, progress JSON on the job row, per-attempt `llm_call` rows for
  successes *and* failures with tokens/cost/prompt_version.
- prompts/pdf_extraction.md keeps the B1/B2 threshold rubric, adds
  exercise-furniture exclusions and term-boundary rules; provider-neutral
  (no Anthropic syntax outside `llm/anthropic.ts`).
- validate-ingestion.ts: throwaway temp DB, never touches real data, excluded
  from check.sh, prints summed cost; documented run cost ~$0.30 (≪ the $5
  single-op ceiling); reads the key from a git-ignored .env — no secret
  committed (verified: no key material anywhere in the diff).

**review-ui:**
- Server-assigned direction respected; w2d front = hero WordEntry with term +
  lemma + POS (GOAL §5 "term as encountered and its lemma"); reveal shows
  **both** definitions + example (GOAL default) in both MC and flip modes —
  tested.
- Flip self-grade Didn't know/Knew it/Easy → fail/good/easy (2/4/5) ✓; MC
  correct → good, "Don't know"/wrong → fail, consistent with the screen spec's
  two-action MC region.
- Microcopy matches D5 exactly where used: prompts ("Choose the
  definition/word."), verdicts ("Correct."/"Not quite."), "Check answer",
  "Don't know", "Next", summary "N cards · M correct", "Review the N missed
  again", "Done", empty "Nothing due. Ingest something new?", generic store
  error string, "*term* · due now" toast.
- Keyboard map 1–4/Enter/Space/D/Esc; QuizOption ordinals render desktop-only;
  ReviewCard 60vh max-height with inner scroll; verdict color + words (never
  color alone); reduced-motion zeroes the progress transition. Tokens used
  throughout (sole raw value noted in N8). Session takes over the viewport
  (no AppNav — none exists yet).
- Review failures are surfaced (toast on failed grade/demote submits), the
  empty / load-error / end-of-session states all exist and are tested
  (9 component tests).

**Triage UI:**
- Group headers "PROBABLY NEW · n" / "YOU MAY KNOW THESE · n", per-group bulk
  buttons, single shared `MAY_KNOW_THRESHOLD` for client and server grouping;
  raised current row advancing through both groups in order; decided rows
  collapse with stamps; sticky fixed footer with live tally
  "Know n · Learn n · Skip n"; Undo (single and bulk as one step, tested);
  K/L/S/U/arrows/Enter keyboard map; key hints desktop-only; TriageRow action
  order Learn (primary, DOM-first for mobile) / Know / Skip per D4; 44px
  targets on row actions; scrollIntoView centering; empty/error states with
  contract microcopy.

**Orchestrator direct commits:** words.ts stub registered but empty;
Library/Ingest placeholder screens; App.tsx minimal path routing
(/triage, /review?deck= default 1, /library, /ingest) — `?deck=abc` falls back
to 1 rather than erroring (fine); `text_extraction` / `word_definition` task
defaults added to `TASK_DEFAULTS` with the setting > env > default resolution
intact — no hardcoded models at call sites. Nothing hidden or problematic.

**Cross-cutting:** no provider-specific types outside adapters; browser never
holds a key; no eval of model output; all new on-disk state under DATA_DIR;
no review_log UPDATE/DELETE anywhere (`grep` over the new modules); no new
dependencies added by these five integrations; Prettier/ESLint pass via
check.sh.

## Not in scope / not re-reviewed

Bootstrap, design-foundation component internals, sm2-engine pure math, and
the pdf-ingestion pipeline's pre-existing code were covered by review-01; this
pass re-read them only as needed to audit the new wiring against them.
