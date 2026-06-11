# Task Board

<!--
Owned and maintained by the orchestrator. Do not edit manually during a run.

Done levels (from GOAL.md §15):
  Task done   — acceptance criteria met, tests pass
  Feature done — all stories shipped, NFRs met, docs updated
  Release done — feature done + success metrics instrumented + GOAL.md §15 release criteria met
                 (this is when the orchestrator stops its loop)
-->

## In Progress

<!-- Format: - **branch-name**: description (spawned: YYYY-MM-DD HH:MM) -->

- **quiz-ux-fixes**: `/quiz` play UX — MC colors green/red instantly on click (no "Check answer" click; correctness decided client-side, persisted async so it's near-instant), remove the "I don't know" option on MC, show the cached explanation on a wrong answer via a quiet `Button` "Explain why" (review-03 B1 + S10-quiz), default length 20→10 (S2), drop the "All" deck segment until multi-deck exists (S3), surface swallowed answer/attempt errors (S4), progress bar reaches the final segment (nit#3), 680px→`--measure-reading` (nit#4). CLIENT-ONLY: owns `web/src/screens/Quiz.tsx` + `Quiz.css`. (spawned: 2026-06-11, plain spawn)
- **lesson-grading-fixes**: lesson free-text grading must ground on the user's actual answer (no unrelated "answer"), add a "you're close — here's how you'd say it" rephrase, add the "Partly right." verdict tier (review-03 S7) threaded through response + EMA weight; switch the `quiz_grading` LLM task to **sonnet at low effort** for fast feedback; fix B2 (lesson-attempt POST failure currently swallowed → surface a Toast + Retry-save, no silent data/mastery loss); pin the lesson-quiz action region to the thumb zone (S9); Review/lesson "Explain why" toggles → `Button` (S10-review); progress bar final segment (nit#3). Owns `web/src/screens/Lesson.{tsx,css}`, `server/src/routes/grammar.ts`, `prompts/quiz_grading.md`, and the `quiz_grading` entry in `server/src/llm/service.ts` TASK_DEFAULTS; may touch `shared/src/grammar-api.ts` for the verdict tier. (spawned: 2026-06-11, `--model "$ORCH_MODEL" --effort high`)
- **triage-fixes**: after "Learn"/"Know"/"Skip" the decided word leaves the queue immediately (investigate + fix the reported "second word to learn was skipped" advance bug); replace the bare post-Keep summary with a useful confirmation screen, and make its "Done" button route to `/review` (start learning) instead of a dead page; ensure `/triage?source=N` redirects sensibly when the queue is empty. Owns `web/src/screens/Triage.{tsx,css}`; may touch `server/src/routes/triage.ts` + `server/src/db/triage-queries.ts`. (spawned: 2026-06-11, `--effort high`)


## Backlog

### Phase 1 fixes — remaining (human stepped away 2026-06-11; finish these, then design polish, then Phase 2)

- **quiz-caching-and-bank** — reuse an existing unflagged cached `quiz_question` before regenerating (review-03 S1 / GOAL §6.4/§6.7 "never regenerate what is stored"); widen the def_match distractor pool so answers aren't all repeated ingested definitions (FEEDBACK: "build a bank when we generate the quiz") and apply the §6.4 distractor-quality rule (similar level, never a synonym of the answer — nit#10); pass `quiz_question_id` for ALL quiz-origin misses incl. def_match (S6). SERVER-ONLY: owns `server/src/jobs/quizGen.ts` + `server/src/routes/quiz.ts` (disjoint from quiz-ux-fixes which is client-only) [Must]
- **ingestion-progress-and-topic-link** — real progress on PDF page reading (per-page N of M) and curriculum building, reported by the jobs and rendered on `/ingest` + `/grammar` (FEEDBACK); plus review-03 S12: have the page-classification LLM name the grammar topic per page and match THAT (deterministically) instead of the filename heuristic, NULL when unconfident. Owns `server/src/jobs/pdfIngestion.ts` + `server/src/jobs/grammarSeed.ts` + the progress-rendering bits of `web/src/screens/Ingest.*` + `Grammar.*` [Should]
- **library-mobile-separator** — `/library` SegmentedControl wraps to 2×2 on mobile with no divider between the two rows; add the row separator. SegmentedControl component CSS [Should — trivial, `--model sonnet`]
- **system-preferences** — add the System screen Preferences section (review-03 S8): "Definitions on reveal · Spanish/English/Both" and "New cards per day · 10/20/40" SegmentedControls backed by a small GET/PUT settings route (the server already reads `new_cards_per_day`); also nit#5 (spend time-windows + errors pager). Needs route pre-partition (register a settings stub in app.ts on base first). Owns System screen + new settings route/queries [Should]
- **shared-api-refold** — `web/src/screens/systemApi.ts` and `grammarApi.ts` re-implement the shared `web/src/api.ts` client; refold both onto it (review-03 S11). Sequence AFTER lesson-grading-fixes (touches grammarApi consumers) and system-preferences [Nit, `--model sonnet`]
- **notes-on-answers** — NEW FEATURE (FEEDBACK): per-answer self-note on any lesson/quiz question, browsable, fed back as context into future quiz/lesson generation. Needs a `note` entity → SCHEMA GATE cycle before build [Should]
- **quiz-attempt-style-mixed** — review-03 S5: `quiz_attempt.style` is falsified ('mixed' written as 'def_match'; lesson attempts record the first question's style). Add `'mixed'` to the CHECK (or make the column nullable) → SCHEMA GATE; then stop writing fabricated values [Should — schema-gated]

### Design polish — AUTHORIZED iteration 55 (Apple-handoff bar; identity D0/D1 unchanged; runs after the Phase-1 fixes above because it rewrites shell/components/all screens)

- **design-polish-contract** [orchestrator-owned, no worker] — amend design/: add a home/landing screen spec + global header nav + simple footer to `screens/shell.md` (+ new `screens/home.md`); elevate `tokens.md` (refined type scale, spacing rhythm, color depth, elevation, motion) and `components.md` to the "designer at Apple handing off to their boss" bar; merriam-webster.com as a STRUCTURAL reference only (not identity). INDEX file map + Change-log lines. Do this first, commit, THEN spawn the foundation
- **design-polish-foundation** — `spawn --model "$ORCH_MODEL" --effort high` (+ design includes): materialize the upgraded tokens stylesheet and restyle the base component library so the seven existing screens inherit the new look. Runs alone (touches the token stylesheet + every base component) [Must]
- **home-nav-footer** — build the home/landing overview (the `/` route should be a navigable overview, not the current default screen — FEEDBACK), the global header nav bar, and the footer, composed from the upgraded components. Touches the shell + App.tsx routing — runs alone [Must]
- **per-screen polish sweeps** — after the foundation lands, quick per-screen passes (one task per 2–3 screens) to adopt the upgraded components/tokens; file-disjoint by screen [Should]

### Phase 2 (gate LIFTED per human master directive; GOAL §5 phase order; §11: lesson recordings → Ask → suggestions → voice). Resume here once Phase-1 fixes are in flight and capacity frees.

- **transcription-layer** — `TranscriptionProvider` adapter interface mirroring LlmProvider (server-side only, key in .env), Whisper-class default adapter, chunking for ~60-min audio, stitch, per-lesson upfront cost estimate (~$0.40/hr), `transcription_call` logging + spend on System page; mocked-provider tests. **Two prerequisites flagged: (a) SCHEMA GATE for `transcription_call`; (b) a transcription provider host is NOT on the firewall allowlist and Anthropic's API does not transcribe audio → FIREWALL/PAID-DEPENDENCY ESCALATION needed before live use (construction + mocked tests can start without it).** [Must — Phase 2, build first; riskiest]
- **lesson-recording-ingestion** — audio upload (m4a/mp3/ogg/wav, ~60 min), lesson_audio Source, resumable transcription job → transcript on Source → LLM analysis (flagged-unknown words → triage; tutor corrections; struggle sentences; topics → grammar_topic seen_in_lessons) → LessonInsight rows; browsable per lesson + per topic; prompt versioned. WAIT for transcription-layer. Real-recording validation WAITS on owner fixture docs/fixtures/lesson-audio/ (absent — gates Phase-2 done, not construction) [Must — Phase 2]
- **ask-chatbot** — persistent ChatThread/ChatMessage with page-context seeding, plain "Ask" button (no floating bubble), server-side tool set (add_word_to_deck, lookup_word, get_page_context) with inline mutation confirmation, threads survive restarts, all turns through llm/service.ts + llm_call logging. Design ready (screens/ask.md + ChatTurn/ToolConfirm/RecordButton). SCHEMA GATE for chat tables [Must — Phase 2]
- **suggestions** — Suggestion table (uniqueness enforced — nothing re-suggested, skips included), LLM-selected one-at-a-time word/grammar-topic proposals calibrated on known/mastered words + mastery, add/skip, pool-exhausted empty state. Design ready (screens/suggestions.md). SCHEMA GATE for suggestion table [Must — Phase 2]
- **voice-questions** — browser MediaRecorder upload → transcription → answered in a persistent Ask thread → one-tap add to SRS. WAIT for transcription-layer + ask-chatbot [Must — Phase 2, last]

### Phase 3+ (decompose when Phase 2 gate nears)

- Phase 3 (Gutenberg/KJV ingestion w/ archaic-aware rubric, English calibration + optional placement assessment, Mochi import — fixture-gated, docs/fixtures/mochi/ absent as of 2026-06-11) and Phase 4 polish [later]

Note: `no-design` and `codex-worker-engine` branches = human-owned (sandbox / spawn-engine infra work on bin/spawn + Dockerfile + firewall), not worker branches (see DECISIONS.md); ignore their ORPHAN status in list-agents.

## Done

<!-- Format: - **branch-name**: description (merged: YYYY-MM-DD HH:MM) [task/feature/release done] -->

- **docs-and-demo**: Phase-1 app docs — docs/README.md cold start (clone→run→phone via LAN/Tailscale, "Where your data lives", backup/restore), root README pointer, TODO-LATER.md, docs/demo.md, LLM hot-swap proof; covers review-01 #9 (merged: 2026-06-11, commit 6af5a1e) [task done]
- **review-03**: audit of the 5 integrations since review-02 → REVIEW.md (2 blockers, 12 should-fixes, 11 nits + clean-bill verification); all dispositioned in DECISIONS.md iteration 55, REVIEW.md removed (merged: 2026-06-11, commit 1c633a9) [task done]

- **grammar-lessons-quizzes**: lesson generation job (lessonGen.ts via `grammar_lesson` LLM task + prompts/grammar_lesson.md), Lesson screen (reading column → practice flow), MC/fill-in/conjugation/free-text answering with LLM grading (`quiz_grading` task + prompts/quiz_grading.md, local grading w/ LLM fallback), "explain why" everywhere, mastery EMA from attempts, Grammar home topics link into lessons (merged: 2026-06-11 14:53, check.sh green on main — 347 tests) [task done]

- **design-phase2-extension**: orchestrator-applied (no worker) — Phase 2 design contract: screens/lessons.md + ask.md + suggestions.md; ChatTurn/ToolConfirm/RecordButton/InsightRow in components.md; shell Ask-button + nav rules; Ingest lesson-audio tab; System transcription spend; Grammar "seen in N lessons"; D5 keys + microcopy; INDEX file map + Change log. No new tokens (done: 2026-06-11 ~14:50, iteration 50) [task done]

- **quiz-engine-ui**: Quiz config/play/results per design/screens/quiz.md (routes/quiz.ts, db/quiz-queries.ts, shared/quiz-api.ts, jobs/quizGen.ts, prompts/quiz_cloze.md, web Quiz.*) + review-02 #8: Review screen "Explain why" + cached-cloze mix-in into due queue (merged: 2026-06-11 14:37, check.sh green on main — 328 tests) [task done]

- **system-page**: System screen per design/screens/system.md (recent errors from error_log, job statuses, LLM spend from llm_call, DB/backup status) + daily timestamped DB backup job (jobs/backup.ts, enqueue-if-due on boot + daily interval); routes/system.ts + db/system-queries.ts + shared/system-api.ts + web System screen + /system route (merged: 2026-06-11 21:08, check.sh green on main — 302 tests) [task done]

- **review-02-fixes**: review-02 blocker #1 (confirmBatch within-batch + homograph duplicates surfaced as dedupeHits, no 500/rollback) + should-fixes #2–#7 + nits N1/N2/N4/N6/N7/N10/N12 — triage dedupe/bulk/summary, SRS demote-creates-card/distractors-from-deck/precision, review thumb zone fixed action region, shared web api client (merged: 2026-06-11 13:57, check.sh green on main — 288 tests) [task done]

- **grammar-curriculum**: curriculum seeding job (grammarSeed.ts) via grammar_curriculum LLM task + prompts/grammar_curriculum.md → grammar_category/grammar_topic rows; grammar home screen per design/screens/grammar.md with mastery-derived practice queue; review-01 #8 page→topic linking in pdfIngestion (merged: 2026-06-11 13:45, check.sh green on main — 274 tests) [task done]
- **library-ui**: library screen + word CRUD API (/api/words GET/POST/PATCH/DELETE, accent-insensitive search, filters, manual add with word_definition auto-fill, delete with history retained, forgot-this, WordDetail provenance) (merged: 2026-06-11 13:26, check.sh green on main — 254 tests) [task done]
- **raw-text-ingestion**: POST /api/sources/text + text_ingestion job + text_extraction LLM task, Ingest screen (paste panel + PDF drop), language select/auto-detect; carried review-01 #5 + #13 (merged: 2026-06-11 13:26, check.sh green on main — 254 tests) [task done]
- **review-02**: audit of integrations 5–9 → REVIEW.md: 1 blocker (confirmBatch duplicate 500), 7 should-fixes, 12 nits + clean-bill verification; all dispositioned in DECISIONS.md 2026-06-11, REVIEW.md removed (merged: 2026-06-11 13:27) [task done]
- **review-01-fixes**: six review-01 findings fixed — migration 002 quiz_question exactly-one CHECK (table rebuild), Multer 413 file_too_large, nowIso ms strip, triage retry ≥44px tap target, WordEntry hero breakpoint → 640px, Button busy default "…" (merged: 2026-06-11 13:04, check.sh green on main — 200 tests) [task done]
- **pdf-ingestion-live-validation**: live end-to-end ingestion of both docs/fixtures/workbook/ PDFs with real Anthropic vision calls; docs/validation-pdf-ingestion.md with per-page outcomes + llm_call cost; fixes: §6.1 {{calibration_sample}} templating, pending rows drop ingestion-time word_id, extractJson fence strip; validate-ingestion.ts script (opt-in, not in check.sh) (merged: 2026-06-11 13:05, check.sh green on main — 200 tests) [task done]
- **review-ui**: SRS review screen at /review per design/screens/review.md over the merged SRS API: due cards, API-assigned direction, MC default + flip-card fallback, three grades, both-definition reveal, "I forgot this" demote (merged: 2026-06-11 13:05, check.sh green on main — 200 tests) [task done]
- **triage-ui**: triage screen end-to-end (routes/triage.ts + db/triage-queries.ts + shared/src/triage-api.ts + web Triage screen): know/learn/skip, batch confirm materializes words with confirm-time lemma dedupe surfaced for keep/merge (merged: 2026-06-11 12:41, check.sh green on main — 179 tests) [task done]
- **srs-api-wiring**: SM-2 engine wired to DB + HTTP: GET /api/decks/:id/due with new-card promotion, POST /api/reviews writing review_log + card_state, POST /api/words/:id/demote; shared/src/srs-api.ts types (merged: 2026-06-11 12:40, check.sh green on main — 179 tests) [task done]
- **review-01**: audit of integrations 1–4 → REVIEW.md, 14 findings (3 contract should-fixes, 3 GOAL-fidelity, 3 design, 5 nits) + extensive clean-bill verification; all findings dispositioned in DECISIONS.md 2026-06-11, REVIEW.md removed (merged: 2026-06-11 12:41) [task done]
- **pdf-ingestion-pipeline**: upload endpoint + ingestion job: PDF stored as source, per-page vision extraction via LlmProvider layer + anthropic adapter, page classification → source_page, candidates → extraction_item; per-page retry; prompts in /prompts; mocked-provider tests (merged: 2026-06-11 11:50, check.sh green on main after npm install — 142 tests; re-spawn 1 resolved the package-lock conflict) [task done]

- **design-foundation**: design/tokens.md materialized as token stylesheet + components.md base components built as composable library in /web, with tests (merged: 2026-06-11, check.sh green on main after npm install — 116 tests) [task done]

- **sm2-engine**: /server/src/srs/ pure SM-2 functions — grade application, manual demotion, maturity ≥21d, review queue builder with new-cards/day promotion; unit tests; new files only (merged: 2026-06-11 18:36, check.sh green on main, 61 tests) [task done]

- **bootstrap**: monorepo scaffold (server/web/shared/prompts) + check.sh + DB layer with migration runner + 001_init.sql (full finalized ARCHITECTURE.md schema) + persistent job queue + structured logger/error_log + config + healthcheck; 20 tests green (merged: 2026-06-11 18:18, after 5 re-spawns — all integration artifacts, not work failures; full history in git log of this file) [task done]

- **arch-critique**: critic pass over ARCHITECTURE.md + seeded design contract (2026-06-10) — all 13 findings adopted and reconciled directly by the orchestrator; branch abandoned after reconciliation (integrate exit 7 was a base-drift artifact; real diff = CRITIQUE.md only — see DECISIONS.md) [task done]

## Blocked

<!-- Format: - description — REASON — needs: what would unblock it -->

<!-- (none) — the UI-polish discussion was answered iteration 55; design polish is now authorized and queued in the Backlog. -->
