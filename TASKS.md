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

- **review-03**: audit of the 5 integrations since review-02 (grammar-curriculum, review-02-fixes, system-page, quiz-engine-ui, grammar-lessons-quizzes) against GOAL.md/ARCHITECTURE.md/design contract; UI diffs for token discipline, component reuse, microcopy; findings → REVIEW.md (spawned: 2026-06-11 ~14:55, `--model "$ORCH_MODEL" --effort medium --include GOAL.md --include ARCHITECTURE.md --include design`)
- **docs-and-demo**: app README cold start at docs/README.md (clone→run→phone via LAN/Tailscale, "Where your data lives", backup/restore exercised once) + pointer section atop root README.md, TODO-LATER.md, docs/demo.md script, LLM hot-swap proof (config-only model change, documented); covers review-01 #9 (spawned: 2026-06-11 ~14:55, plain spawn, no includes — requirements pasted verbatim)


## Backlog

<!-- Phase 1 (GOAL.md §11 order: PDF ingestion → SRS review → raw text → quizzes → grammar); thinnest slice first, riskiest part of each slice first. Format: - description [priority] -->

### Phase 2 (decomposed iteration 49; HUMAN REVIEW GATE — per FEEDBACK 2026-06-11, when grammar-lessons-quizzes + review-03 + docs-and-demo are Done and trunk green, post [PENDING] "Phase 1 ready for your review" in QUESTIONS.md and spawn NOTHING below until answered. GOAL §5 phase order; §11 order: lesson recordings → Ask → suggestions → voice)

- **transcription-layer** — `TranscriptionProvider` adapter interface mirroring LlmProvider (server-side only, key in .env), Whisper-class default adapter, chunking for ~60-min audio, stitch, per-lesson upfront cost estimate (~$0.40/hr), `transcription_call` logging + spend on System page; mocked-provider tests; ffmpeg-free path acceptable for pure-audio v1, video-container audio extraction via free OSS if cheap (GOAL §16). Likely touches ARCHITECTURE.md `transcription_call` entity — schema gate cycle expected first [Must — Phase 2, build first; riskiest]
- **lesson-recording-ingestion** — audio upload endpoint (m4a/mp3/ogg/wav, ~60 min), lesson_audio Source, transcription job (resumable chunks) → transcript stored on Source → LLM analysis pass (flagged-unknown words → standard triage; tutor corrections; struggle sentences; topics covered → grammar_topic seen_in_lessons) → LessonInsight rows; insights browsable per lesson + per topic; prompt versioned in /prompts. WAIT for transcription-layer. Validation against a real recording WAITS on owner fixture docs/fixtures/lesson-audio/ (absent as of 2026-06-11; gates Phase 2 done, not construction — mining prompt's flagging phrases seeded from that transcript when it arrives) [Must — Phase 2]
- **ask-chatbot** — persistent ChatThread/ChatMessage with page-context seeding, plain "Ask" button on most pages (no floating bubble), server-side tool set (add_word_to_deck, lookup_word, get_page_context) with inline mutation confirmation in the chat UI, threads survive restarts, all turns through llm/service.ts + llm_call logging. Design ready (screens/ask.md + ChatTurn/ToolConfirm/RecordButton, shell Ask-button rule); schema gate for chat tables [Must — Phase 2]
- **suggestions** — Suggestion table (uniqueness enforced — nothing ever re-suggested, skips included), LLM-selected one-at-a-time word/grammar-topic proposals calibrated on known/mastered words + mastery, add/skip actions (add → deck+SRS or practice queue), pool-exhausted honest empty state. Design ready (screens/suggestions.md); schema gate for suggestion table [Must — Phase 2]
- **voice-questions** — browser MediaRecorder upload → transcription → answered in a persistent Ask thread → one-tap add of relevant items to SRS. WAIT for transcription-layer + ask-chatbot [Must — Phase 2, last]

### Phase 3+ (decompose when Phase 2 gate nears)

- Phase 3 (Gutenberg/KJV ingestion w/ archaic-aware rubric, English calibration + optional placement assessment, Mochi import — fixture-gated, docs/fixtures/mochi/ absent as of 2026-06-11) and Phase 4 polish [later]

Note: `no-design` and `codex-worker-engine` branches = human-owned (sandbox / spawn-engine infra work on bin/spawn + Dockerfile + firewall), not worker branches (see DECISIONS.md); ignore their ORPHAN status in list-agents.

## Done

<!-- Format: - **branch-name**: description (merged: YYYY-MM-DD HH:MM) [task/feature/release done] -->

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
