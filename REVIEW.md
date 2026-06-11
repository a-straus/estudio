# Review 03 — audit of the five most recent integrations

Scope: the merge commits `82c4fda` (grammar-curriculum), `bc539c7` (review-02-fixes),
`7d18542` (system-page), `3320848` (quiz-engine-ui), `2c6441c` (grammar-lessons-quizzes),
each diffed against its first parent, audited against GOAL.md (§5/§6/§7),
ARCHITECTURE.md, and the design/ contract. Line numbers refer to the current
tree (all five merged). `bash check.sh` passes on this tree (347 tests).

---

## Blockers

### B1. Quiz play never shows the cached explanation on a wrong answer
- **Where:** `web/src/screens/Quiz.tsx:222-236` (QuizCard answered branch).
- **What:** After answering, the play screen shows only the verdict line and a
  "Next" button. The cached explanation — which the server returns on every
  `/api/quiz/answer` response (`server/src/routes/quiz.ts:229-234`) and which the
  component already stores in `outcome.explanation` — is never rendered during
  play, and there is no "Explain why" button. It surfaces only later, on the
  Results screen behind a per-row toggle.
- **Why it matters:** GOAL §5 quiz Must: "*a wrong answer shows a pre-generated,
  cached explanation of why the correct answer is right and mine is wrong*" —
  immediate per-question feedback is the acceptance criterion. The D5 answer-
  feedback choreography also specifies a quiet "Explain why" button in the
  post-answer action region. The data is already on the client; it's purely a
  rendering omission.
- **Fix:** In the answered branch of QuizCard, render an "Explain why" toggle
  (quiet Button) exposing `outcome.explanation`, auto-expanded (or at least
  available) on wrong answers — same pattern ClozeCard already uses in
  `Review.tsx:375-389`.

### B2. Lesson-quiz results and mastery update silently lost if the attempt POST fails
- **Where:** `web/src/screens/Lesson.tsx:323-333` (`finish()` —
  `submitLessonAttempt(...).catch(() => {})`).
- **What:** The completed lesson-quiz attempt is persisted *only* by this one
  POST (`/api/grammar/attempt`), which also performs the mastery EMA update.
  Unlike vocabulary quizzes (where every miss is written to `review_log` at
  answer time), lesson answers are not persisted per question. If the POST
  fails (server restart, network blip on the phone), the entire attempt record
  is gone and mastery never moves — and the catch swallows the error, so the
  Results screen renders as if everything saved (the mastery line just quietly
  doesn't appear).
- **Why it matters:** GOAL §5 grammar Must requires "*topic mastery is tracked*",
  and the quality bar is explicit: "No data loss. Errors are surfaced to the UI
  and logs, never swallowed." This is user study-history lost with zero signal.
- **Fix:** Surface the failure (Toast error + a "Retry save" action on the
  Results screen) and/or grade-and-record server-side per answer the way the
  vocab quiz route does, so the aggregate POST is no longer the only persistence.

---

## Should-fix (contract deviations)

### S1. Quiz generation never reuses cached questions before regenerating
- **Where:** `server/src/jobs/quizGen.ts:197-256` (`runQuizGen`); no lookup of
  existing `quiz_question` rows anywhere in the job.
- **What:** Every quiz run generates fresh questions. For cloze styles that
  means a new LLM call per word per quiz, even when the word already has an
  unflagged cached cloze question (the kind `getClozeReviewsForWords` happily
  serves to the Review screen from cache).
- **Why it matters:** GOAL §6.4: "*All generated questions are cached in the DB
  and reused before regenerating*"; §6.7: "*Never regenerate what is stored.*"
  Caching-first is also the stated NFR performance lever, and this burns spend
  (each 10-question mixed quiz ≈ 5 avoidable LLM calls once questions exist).
- **Fix:** Before `buildCloze` (quizGen.ts:236), query for an existing unflagged
  cloze `quiz_question` for the word and reuse its id; only call the LLM when
  none exists.

### S2. Quiz setup defaults to length 20; GOAL default is 10
- **Where:** `web/src/screens/Quiz.tsx:292` (`useState("20")`).
- **Why it matters:** GOAL §5 quiz Must and §6.4 both fix the default at 10
  ("default 10 questions" — an owner-delegated call recorded in §11).
- **Fix:** `useState("10")`.

### S3. "All" deck option silently quizzes only the Spanish deck
- **Where:** `web/src/screens/Quiz.tsx:80-82` (`deckIdFor` returns 1 for "all"),
  deck ids 1/2 hardcoded in `DECK_OPTIONS` (lines 38-42).
- **What:** The user picks "All" and gets a Spanish-only quiz with no
  indication. Deck ids are also assumed rather than fetched.
- **Why it matters:** The setup UI misrepresents what will happen — a quiet
  wrong-behavior, worse than not offering the option. (Design quiz.md does list
  an "All" segment, but serving something other than what was selected isn't a
  defensible reading of it.)
- **Fix:** Either implement multi-deck generation server-side or drop the "All"
  segment until it exists; fetch deck ids from `/api/decks` instead of
  hardcoding.

### S4. Errors swallowed in the quiz answer/attempt paths
- **Where:**
  - `web/src/screens/Quiz.tsx:127-145` — `grade()` has `try … finally` with **no
    catch**; a failed `/api/quiz/answer` becomes an unhandled promise rejection
    (via `void grade(...)`) and the user gets no feedback at all (the Lesson
    screen's equivalent, `Lesson.tsx:81-108`, does this correctly with a
    `gradeError` line — copy that pattern).
  - `web/src/screens/Quiz.tsx:391-395` — `submitAttempt(...).catch(() => {})`
    drops the aggregate attempt record silently (less severe than B2 because
    misses were already written to `review_log` per answer, but still a silent
    loss of the `quiz_attempt` row).
- **Why it matters:** Quality bar: "Errors are surfaced to the UI and logs,
  never swallowed."

### S5. `quiz_attempt.style` is falsified for mixed quizzes and lesson attempts
- **Where:** `server/src/db/quiz-queries.ts:231-233` ("a 'mixed' quiz is
  recorded as 'def_match'"); `server/src/routes/grammar.ts:283-293` (a lesson
  attempt records the first question's style for the whole mixed-style set).
- **What:** The stored row claims a concrete style the attempt didn't have.
  Anything later computed off `quiz_attempt.style` (per-style accuracy, the
  Progress view) will be wrong.
- **Why it matters:** ARCHITECTURE defines `quiz_attempt` as "quiz metadata
  (deck_id/topic_id, style, direction)". Recording a knowingly false value is
  schema-drift-by-data. The CHECK constraint not having 'mixed' should have
  been raised through the schema gate, not worked around.
- **Fix:** Propose adding `'mixed'` to the CHECK via the schema gate (or make
  the column nullable like `direction`); don't write fabricated values.

### S6. `review_log.quiz_question_id` omitted for def_match quiz misses
- **Where:** `server/src/routes/quiz.ts:178-183` — `quizQuestionId: q.style ===
  "cloze" ? q.id : null` even though `q.id` is in hand for def_match misses too.
- **Why it matters:** ARCHITECTURE: quiz_question_id is "set for cloze/**quiz-
  rendered** reviews so the rendered form is recoverable". A def_match quiz miss
  is quiz-rendered; with NULL, the rendered question can't be recovered from the
  append-only log.
- **Fix:** Pass `q.id` for all quiz-origin misses.

### S7. Free-text grading has no "Partly right." tier
- **Where:** `prompts/quiz_grading.md` (verdict is binary correct/incorrect);
  `server/src/routes/grammar.ts:62-76` (`parseGrading`);
  `web/src/screens/Lesson.tsx:178-180` (verdict renders only "Correct." /
  "Not quite.").
- **Why it matters:** design/interaction.md microcopy table — "Free-text
  verdicts: 'Correct.' / 'Partly right.' / 'Not quite.'" — and the grammar
  screen spec ("machine grades to Correct / Partly / Incorrect with a one-line
  reason"). The middle verdict is a contract string, not a nicety.
- **Fix:** Add `"partial"` to the prompt's verdict enum, thread it through
  `LessonAnswerResponse`, render "Partly right."; decide its score weight (e.g.
  0.5) in the mastery EMA.

### S8. System screen is missing the Preferences section
- **Where:** `web/src/screens/System.tsx` (sections: SPEND / JOBS / ERRORS /
  BACKUP only).
- **What:** design/screens/system.md region 5 specifies Preferences rows —
  "Definitions on reveal · Spanish / English / Both" and "New cards per day ·
  10 / 20 / 40" as SegmentedControls. The server already reads the
  `new_cards_per_day` setting (`srs-queries.ts:50-60`) and GOAL §6.2/§17 call
  the definition-display preference "a setting the owner may change" — but no
  UI anywhere writes either setting.
- **Why it matters:** Two GOAL-mandated settings are currently unreachable by
  the owner; the screen contract lists Preferences as a region of this page.
- **Fix:** Add the Preferences section backed by a small GET/PUT settings route.

### S9. Lesson-quiz action region ignores the thumb-zone rule
- **Where:** `web/src/screens/Lesson.css:198-203` (`.lesson-quiz__actions` is
  a plain in-flow flex row); contrast `Review.css:97-110` and Triage, which
  correctly pin the action region (`position: fixed`, paper background, top
  hairline) on phones.
- **Why it matters:** D5 thumb-zone rules: "The bottom 30% of the viewport owns
  every required action" for sessions; the lesson quiz is a session. On a long
  free-text question the Check/Don't-know buttons can sit mid-viewport or
  below the fold. Phone is a co-primary surface.
- **Fix:** Reuse the fixed action-region pattern (or the existing
  `review__actions` styles) for `.lesson-quiz__actions` below bp-desktop.

### S10. "Explain why" toggles are sub-44px raw buttons, not the Button component
- **Where:** `web/src/screens/Review.css:129-139` (`.review__explain-toggle`)
  and `web/src/screens/Quiz.css:108-118` (`.quiz-result__explain-toggle`); used
  at `Review.tsx:378-385` and `Quiz.tsx:275-282`.
- **What:** Both are bespoke `<button>`s at `--text-xs` with `--space-1` vertical
  padding — well under the 44px hit target — instead of the quiet `Button`
  variant the D5 choreography specifies for "Explain why".
- **Why it matters:** GOAL §7: "≥44px tap targets (now load-bearing — phone is
  a primary surface)"; design contract: compose the built component library,
  don't re-invent one-off styles.
- **Fix:** Replace both with `<Button variant="quiet">` (it already enforces
  `min-height: var(--hit-target)` on mobile).

### S11. Duplicated fetch clients instead of the shared `web/src/api.ts`
- **Where:** `web/src/screens/systemApi.ts:9-40` and
  `web/src/screens/grammarApi.ts:8-39` each re-implement `ApiError` + `api<T>()`
  verbatim.
- **What:** review-02-fixes introduced the shared client (`web/src/api.ts`) and
  refolded ingest/library/review/triage onto it. system-page and
  grammar-lessons-quizzes merged *afterwards* and re-created private copies
  (grammarApi's copy predates the shared client but was extended rather than
  migrated in merge 5).
- **Why it matters:** Three drifting copies of error-translation logic; the
  whole point of the review-02 fix was one client. Pure duplication/dead code.
- **Fix:** Both modules import `{ api, ApiError }` from `../api` like the other
  four screen API modules do.

### S12. PDF grammar-page → topic link matches on the file title only, not page content
- **Where:** `server/src/jobs/pdfIngestion.ts:94-96, 169-178, 188-208`
  (`sourceLabel` = source title + ref; `matchGrammarTopic` substring/keyword
  match against it).
- **What:** Every grammar page in a given PDF gets the *same* topic (or none),
  decided by whether the uploaded filename happens to contain a topic name. A
  workbook scan named "leccion-5.pdf" links nothing; a book named
  "subjuntivo.pdf" links every grammar page in it to the first Subjuntivo topic.
  The page-classification LLM call already reads the page and could name the
  topic for free.
- **Why it matters:** GOAL §5 PDF Must (*Additionally*-clause): grammar pages
  are "linked to the curriculum **so lessons and quizzes can be generated
  aligned to what the tutor is actually teaching**" — a filename heuristic
  doesn't deliver that, and the grammar home's "what the tutor is covering"
  reads off these links (ARCHITECTURE, `source_page`).
- **Fix:** Have the existing page-classification prompt return a topic guess for
  grammar pages and match *that* (still deterministically) against the seeded
  topic list; keep NULL when unconfident.

---

## Nits

1. **`/api/quiz/:jobId/questions` doesn't check job type** —
   `server/src/routes/quiz.ts:138-141`: any job id (e.g. a backup job) is
   accepted and polled; a `done` non-quiz job yields an empty question set and a
   misleading "Couldn't write questions" in the UI. The lesson poll route checks
   `job.type` (`grammar.ts:222`); do the same here.
2. **`reportProgress` keys on `type+status`, not job id** —
   `server/src/jobs/quizGen.ts:60-67`. Safe only because the queue is strictly
   single-runner; passing the job id through the handler would remove the
   coupling.
3. **Progress bars never reach the last segment** — `Quiz.tsx:552`
   (`index / total`) and `Lesson.tsx:133` show 90% while answering the final
   question; Review uses the same formula. Cosmetic.
4. **Raw `680px` where `--measure-reading` exists** — `Quiz.css:142`. The other
   literals (560px review column, 480px setup column, 8px status dot) have no
   token and appear verbatim in the design files, so they're fine; 680px has a
   token.
5. **System spend line deviates from the contract string** — spec: "LLM spend ·
   $4.12 since May 1 · $0.84 this week" (system.md / D5); implemented as
   "LLM spend · $X · N calls" with no time windows (`System.tsx:84-88`).
   Errors section also caps at 50 with no "Older →" pagination (spec: 20 + pager).
6. **Curriculum is seeded by a manual button, not on first run** —
   `Grammar.tsx:150-160`; design grammar.md empty state says "curriculum
   AI-seeded on first run". The button is defensible UX (cost visibility) but
   is a contract deviation worth a DECISIONS.md line.
7. **Practice queue is arbitrary before any quiz history** —
   `grammar-queries.ts:127-137`: all topics start at mastery 0, so "PRACTICE
   NEXT" shows 3 effectively random unread topics from day one. Consider
   requiring `quiz_count > 0` (or seeding from `seen_in_lessons`) before a topic
   qualifies.
8. **Choice-mode reviews never offer the "easy" grade** — `Review.tsx:151-156`
   maps correct→`good`; only flip mode exposes Didn't know/Knew it/Easy. This
   predates these five merges, but the new ClozeCard (`Review.tsx:330-336`)
   replicates the pattern, so the GOAL §5 three-grade criterion is only fully
   met in flip mode. Worth one deliberate decision (D5's choice-mode spec
   implies the current behavior; GOAL's wording implies three grades always).
9. **Synchronous LLM call in a request handler** — `POST /api/grammar/answer`
   (`grammar.ts:236-262`) grades free text inline. Usually <2s, but an LLM p95
   can exceed the §7 async threshold; the UI does show a pending state, so this
   is borderline-acceptable. Note it in DECISIONS.md or move to a short job.
10. **Distractor quality rule unenforced for def_match** — GOAL §6.4 ("similar
    level, never the correct answer's synonym"): `buildDefMatch`
    (`quizGen.ts:78-107`) picks random deck definitions with no level or synonym
    screening. The flag button exists as the escape hatch, but the rule is
    nowhere applied.
11. **Daily backup `setInterval` ignores manual backups** — `index.ts:42-47`
    enqueues every 24h regardless of a manual backup minutes earlier. Harmless
    (backups are cheap, pruned at 14), just noise.

---

## Clean bill — verified sound

- **check.sh** passes on the merged tree: typecheck, build, 347 tests across 44 files.
- **SRS integrity (review-02-fixes, quiz-engine-ui):** `review_log` remains
  append-only — every write path goes through `persistReviewOutcome`'s INSERT;
  no UPDATE/DELETE on the table anywhere. Quiz misses write `origin='quiz'`,
  grade `fail`, and pull `due_at` to now inside one transaction
  (`recordQuizMiss`), matching §6.3/§6.4. Manual demotion on a word with no
  card_state now correctly *creates* the card at demoted ease (route
  `srs.ts:180-205`), fixing the prior 409, and logs `manual_demotion`.
  Timestamps are clamped to the project's second-precision ISO convention
  (`toSecondPrecision`) before persisting.
- **Within-batch dedupe + homographs (review-02-fixes):** `confirmBatch` now
  checks collisions item-by-item inside the transaction against both
  `lemma_normalized` and exact `(term, language)`, so same-batch duplicates and
  homographs surface as dedupe hits instead of violating UNIQUE or 500ing;
  bulk decisions no longer override hand decisions (`decision !== 'pending'`
  guard); skips are stamped `decided_at`. Matches the ARCHITECTURE dedupe rule
  (surfaced, never silent; never a constraint on normalized forms).
- **Curriculum seeding (grammar-curriculum):** idempotent (category-count gate
  both in the job and the 409 route), single transaction so a partial
  curriculum can never land, prompt versioned in `/prompts`, strict parse that
  rejects empty categories/topics. Practice queue and "seen in lessons" are
  derived at read time — no stored counters, exactly as ARCHITECTURE specifies.
- **Backups (system-page):** uses better-sqlite3's online `db.backup()` (safe
  under WAL), timestamped filenames under `DATA_DIR/backups`, prune-to-14,
  boot-time catch-up guarded by a 24h window so restart loops can't flood the
  queue; manual button shares the job's code path; pre-migration backup already
  exists in `migrate.ts` (verified) so GOAL §6.8's both cadences are covered.
- **System page (system-page):** spend reads `llm_call` (per-task breakdown,
  error calls included — correct, they still burn tokens), errors read the
  capped `error_log` the logger writes, jobs read the `job` table; each section
  loads and fails independently with the "irony case" message from the spec.
- **Job queue / error handling:** retry with exponential backoff, error + stack
  persisted on the job row, `running` → `queued` recovery on boot; LLM service
  writes one `llm_call` row per attempt, success and failure, with
  prompt_version hash of the raw template. Lesson/quiz/curriculum generation
  all run as jobs (async, polled) per §7.
- **Explanations generated eagerly:** cloze questions (`quiz_cloze` prompt) and
  every lesson question (`grammar_lesson` prompt) carry their explanation from
  the same generation call, persisted on the `quiz_question` row — never lazy,
  per ARCHITECTURE. The Lesson screen shows "explain why" after *every* answer,
  correct ones included (GOAL §5 grammar Must) — verified at
  `Lesson.tsx:194-196`.
- **Lesson flow (grammar-lessons-quizzes):** explanation → examples → quiz order
  enforced by the screen phases; lesson content stores explanation+examples
  only, quiz questions are `quiz_question` rows with `lesson_id`+`topic_id`
  (and migration 002's exactly-one-of CHECK holds: word_id NULL, topic_id set);
  lessons cached forever, regeneration writes a new row keeping the old;
  grading is server-authoritative with normalized exact-match short-circuit
  before any LLM call ("Don't know" never calls the LLM); grading failures
  return a proper 502 with the D5-conformant message and are logged. Mastery
  EMA (0.7/0.3) is a reasonable "loose spaced repetition" reading of §6.5.
- **Token discipline:** all five UI diffs scanned — every color, font, spacing,
  and radius references a token; the only raw values are design-spec literals
  (breakpoints written literally with `/* bp-* */` comments as tokens.md
  instructs, 560/480px column widths, 8px status dot, hairline 1px) plus the
  one 680px noted in nits. `prefers-reduced-motion` handled in the new CSS.
  Serif/sans/mono roles follow the bilingual table (cloze options serif via the
  `cloze` prop, machine meta in `--font-meta`, lesson examples serif-Spanish +
  sans-gloss).
- **Microcopy:** "Writing questions… N of M", "Couldn't write questions. Try a
  shorter quiz, or retry.", "Writing the lesson… ~40s", "Correct." / "Not
  quite.", "Take the quiz", "No words yet. Ingest something first.", verdict
  wording and Toast strings all match the D5 table where the table defines them.
- **Security floor:** no API key or provider reference anywhere under `web/`;
  all LLM calls server-side through the adapter layer; prompts in versioned
  `/prompts` files; no `eval`/`Function` on model output (JSON.parse with strict
  validation everywhere); model output is rendered as React text nodes (no
  `dangerouslySetInnerHTML`).
- **Schema/conventions:** no ad-hoc schema drift — none of the five merges adds
  or alters migrations; all new SQL targets existing 001/002 tables with
  snake_case columns, INTEGER ids, ISO-UTC text timestamps, and camelCase
  mapping confined to the query layer, as ARCHITECTURE requires.
- **Cross-merge interaction checked:** quiz-engine-ui's cloze cache is what the
  Review mix-in serves (`getClozeReviewsForWords` — newest unflagged per word,
  malformed payloads skipped, additive fallback to MC/flip); grammar-lessons-
  quizzes' lesson questions use distinct styles (`fill_in`/`conjugation`/
  `free_text`/`def_match` with topic_id) and never collide with the vocab quiz
  path (word_id) — the two grading paths are properly disjoint at the data
  level.
