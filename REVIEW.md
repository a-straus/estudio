# Review — audit of integrations 1–4 against GOAL.md, ARCHITECTURE.md, and design/

Scope: monorepo bootstrap (server scaffold, db/migrations, job queue, logger, config),
SM-2 engine (`/server/src/srs/`), design foundation (`/web`), PDF ingestion pipeline
(`/server/src/llm/`, `/server/src/pdf/`, `/server/src/jobs/`, `routes/sources.ts`, `/prompts`).
Verified against `bash check.sh` in this session: typecheck + build + 142/142 tests green.

Severity: **blocker** (contract broken, will cause wrong behavior) ·
**should-fix** (contract deviation or gap, fix before the area is built on) ·
**nit** (minor, no behavioral risk today).

---

## 1 · ARCHITECTURE.md conformance

### Findings

1. **should-fix** — `server/src/jobs/pdfIngestion.ts:210-251` (`insertExtractionItems`)
   - Contract: ARCHITECTURE.md `extraction_item.word_id` is "set when a `learn`/`know`
     decision materializes a word row at batch confirm". Lemma dedupe is described as a
     triage-surfaced *check*, not a stored link on pending rows.
   - Code: dedupe hits write the matched existing `word.id` into `word_id` on a row whose
     `decision` is still `pending`. A pending item with `word_id` set is now ambiguous with
     a materialized one — the triage-ui task, reading the contract, will overwrite or
     misread this field at batch confirm.
   - Fix: compute the dedupe match at triage read time (join on `lemma_normalized`), or take
     a dedicated nullable column (e.g. `duplicate_of_word_id`) through the schema gate.

2. **should-fix** — `server/src/db/migrations/001_init.sql:127-139` (`quiz_question`)
   - Contract: ARCHITECTURE.md says "word_id or topic_id (one nullable)" — exactly one set.
   - Code: both columns are independently nullable with no CHECK; a row with both NULL or
     both set is accepted.
   - Fix: gated migration adding `CHECK ((word_id IS NULL) <> (topic_id IS NULL))` before any
     quiz code writes the table.

3. **should-fix** — `server/src/routes/sources.ts:30-33` + `server/src/app.ts:71-80`
   - Contract: "Errors: `{ error: { message, code } }` with proper status codes."
   - Code: an upload over the 50 MB multer limit throws `MulterError` into the generic
     error handler → `500 internal_error`. A client-side fault returns a server-error code
     (and a misleading generic message).
   - Fix: catch `MulterError` (LIMIT_FILE_SIZE) and return 413 with a `file_too_large` envelope.

4. **nit** — `server/src/db/db.ts:16` (`nowIso`) vs SQL column DEFAULTs in `001_init.sql`
   - Contract: timestamps "TEXT ISO-8601 UTC (`2026-06-10T12:00:00Z`)".
   - Code: app-written timestamps carry milliseconds (`…36.173Z`); rows created via SQL
     DEFAULT have none (`…36Z`). Both ISO-8601 UTC, but the same column mixes two formats,
     which is untidy for lexicographic comparison/debugging.
   - Fix: strip milliseconds in `nowIso()` (or always pass timestamps explicitly and drop the defaults).

5. **nit** — `server/src/jobs/pdfIngestion.ts:218-220`
   - The dedupe lookup hardcodes `language = 'es'`. Correct for the PDF pipeline (Spanish
     workbooks), but the raw-text pipeline (Phase 1, both languages) will reuse this code path.
   - Fix: take language as a parameter when raw-text ingestion lands.

6. **nit** — `server/src/jobs/queue.ts:26-31` + `server/src/llm/service.ts:23`
   - Retry backoff state is in-memory only (documented), so after a restart a failing job
     retries immediately; and LlmService retries ×3 inside a job handler the queue retries
     ×3 — up to 9 provider calls per persistently failing page. Within contract ("retry with
     backoff up to attempts limit") but worth knowing for spend.
   - Fix: none required; consider maxAttempts=1 on either layer for LLM-driven job types.

### Clean

- `001_init.sql` matches the entities section: every table/column present, enums as CHECKs,
  `UNIQUE(term, language)` exact-match only (verified by test), `term_normalized`/`lemma_normalized`
  plain indexed columns, `review_log` word_id `ON DELETE SET NULL`, jobs/llm_call/transcription_call/
  error_log/setting shaped as specified, exactly two decks seeded.
- `review_log` append-only: no code path writes, updates, or deletes it yet (grep-verified).
- snake_case→camelCase mapping happens at the query layer (`db/queries.ts`); API JSON is camelCase.
- Error envelope shape `{error:{message,code}}` used on every 4xx/404/500 path; never 200-with-error.
- Prompts live in `/prompts/<task>.md`, loaded at call time with a content hash recorded as
  `prompt_version`; no inline prompt strings anywhere (grep-verified).
- Provider isolation holds: `@anthropic-ai/sdk` is imported only in `llm/anthropic.ts`; the
  service/handlers see only the `LlmProvider` seam. Model/provider per task resolves
  setting > env > default (`claude-fable-5` for pdf_extraction per the contract); never
  hardcoded at call sites. Adapter pricing table matches current published per-MTok pricing
  and cache write (1.25×) / read (0.1×) multipliers.
- Jobs: all LLM/PDF work runs through the `job` table; upload route persists file + source +
  page rows *before* enqueue (no input loss); `running` → `queued` on boot; one llm_call row
  per attempt, success and failure alike.
- Migration runner: numbered files, `migration` table, timestamped `VACUUM INTO` backup
  before any pending migration (test-verified).
- Secrets: `.env` only (git-ignored, `.env.example` present), read once into typed config;
  the key is never serialized into any response and never reaches `/web`.

## 2 · GOAL.md fidelity

### Findings

7. **should-fix** — `prompts/pdf_extraction.md` + `server/src/llm/prompts.ts:19-27`
   - Contract: GOAL §6.1 "Likely-known calibration (both languages): **every** classification
     batch includes a sample of the owner's known and mastered words as calibration examples."
   - Code: the extraction prompt is a static file with no calibration-sample slot, and the
     prompt loader has no templating at all — the pipeline shape quietly drops the calibration
     mechanism. Harmless today (no known words exist yet) but it narrows §6.1 silently.
   - Fix: add a `{{calibration_sample}}` placeholder + simple substitution in `loadPrompt`, fed
     from known/mastered words (empty list OK for now).

8. **nit** — `server/src/jobs/pdfIngestion.ts:155`
   - GOAL §5 (Must · Phase 1): grammar pages are "tagged as grammar material **and linked to
     the curriculum**". Classification + tagging works (test-verified); `grammar_topic_id`
     stays null with a comment deferring curriculum linking to a later task. Acceptable
     staging, but no open task stub exists in the tree for it — make sure the grammar task
     brief picks this up.

9. **should-fix** — repo root (docs)
   - Contract: GOAL §12/§15 require an app README with setup, "Where your data lives",
     backup/restore, and **phone access via LAN/Tailscale in Phase 1**. The root `README.md`
     is the orchestration sandbox's document, not the app's; no app README exists anywhere.
     (DECISIONS.md / TODO-LATER.md are excluded from worker checkouts, so their presence on
     trunk could not be audited from this branch.)
   - Fix: add an app README (or `docs/README.md`) before the Phase 1 gate.

### Clean

- No §3 non-goal is crossed: no analytics/telemetry, no accounts, no native-app machinery,
  no TTS, no offline mode, no third-party services beyond the Anthropic SDK.
- Per-page processing, per-page failure recording, individual page retry, and resume from
  last completed page are all implemented and tested against the real workbook fixtures —
  no quiet narrowing of §6.1's per-page retry story.
- Page classification vocab-vs-grammar exists with the dominant-purpose rule in the prompt.
- Dedupe is surfaced, never a drop: duplicate candidates still become pending extraction
  items (test-verified) — modulo finding #1 on *how* the match is stored.
- SM-2 semantics match §6.3 exactly: three grades ≈ 2/4/5, fail resets interval + reps,
  "forgot this" = due now + interval 0 + ease −0.15 floored at 1.3, maturity at ≥21 days,
  new-cards/day default 20 promoted at session start, deterministic direction selection.
- Word input survives failure: file, source, and page rows persist before the job exists;
  job failure leaves them intact and retryable.

## 3 · Design / token discipline in /web

### Findings

10. **should-fix** — `web/src/components/TriageRow.css:122-134` (`.triage-row__retry`)
    - Contract: GOAL §7 / ARCHITECTURE web conventions: "≥44px tap targets" (load-bearing,
      phone primary); D4 Button: "min-height --hit-target on mobile".
    - Code: the inline retry button in the triage error row sets `min-height: 0; padding: 0`
      at all widths — a sub-44px tap target on the primary mobile surface, and it is the only
      actionable element in the row.
    - Fix: keep the inline look but restore the hit area (e.g. padding + negative margin, or
      a ::before tap-area overlay) below bp-tablet.

11. **nit** — `web/src/components/WordEntry.css:66-71`
    - Contract: D4 hero variant "headword --text-2xl (mobile) / --text-3xl (desktop)", with
      D4's glossary "Mobile = below bp-tablet unless stated" — implying --text-3xl from 640px.
    - Code: switches at 960px (bp-desktop), so tablets 640–959px get the mobile size.
      Defensible reading ("desktop" = bp-desktop), but inconsistent with the stated glossary.
    - Fix: confirm intent; if "not mobile" was meant, change the media query to 640px.

12. **nit** — `web/src/components/Button.tsx:30-34`
    - Contract: D4 Button busy state: 'text → "…ing" form + disabled'.
    - Code: the "…ing" label only appears if the caller passes `busyLabel`; `busy` without it
      disables but keeps the original label.
    - Fix: derive a default (e.g. append "…") or document `busyLabel` as required with `busy`.

### Clean

- `tokens.css` is a verbatim materialization of design/tokens.md (diff-checked), including
  the dark theme overriding color tokens only; `base.css` implements the exact focus rule
  (`2px solid var(--color-focus)`, offset 2px, `:focus-visible`) and the no-exceptions
  reduced-motion zeroing.
- No unsanctioned raw visual values: every literal found (8px status/error dots, 4px progress
  track, 3×12px sparkline ticks, 36px desktop control height, 420px toast max-width, breakpoint
  values written literally with `/* bp-* */` comments) is specified verbatim in the contract.
- Component specs hold: WordEntry hero/full/compact anatomy incl. the hanging indent and
  em-dash lemma; QuizOption states with 2px-border padding compensation, verdict words
  ("Correct"/"Your answer", never color alone), desktop-only ordinals; ReviewCard cross-fade
  flip (no 3D), 60vh cap, pinned prompt, accent 5-underscore cloze blank; TriageRow
  Learn-first full-width mobile order and Know/Learn/Skip desktop order with K/L/S hints at
  bp-desktop; JobStatus all-mono with the app's only looped animation removed under
  reduced-motion; Toast ink-on-paper with underlined action; SegmentedControl radiogroup with
  roving tabindex, arrow keys, sub-400px wrap; WordDetail viewing/editing/saving/confirm-delete
  states with shadow-2 inline dialog.
- Microcopy matches D5 exactly where used: "defining…", "definition failed — write one in
  Library, or retry", "Know/Learn/Skip", "I forgot this", "Delete *word*? Its card and
  schedule go with it." / "Delete" / "Keep".
- Keyboard focus styles present globally and per-component; studied-language/serif rules
  honored down to the delete-confirm word and study-text inputs.

## 4 · Code health

### Findings

13. **nit** — `server/src/jobs/handlers.ts` (demo job handler)
    - Scaffolding handler registered in production boot (`index.ts:21`). Only reachable via
      server-side enqueue, so harmless, but it is dead weight once real job types exist.
    - Fix: delete it (and its registration) when the next job type lands.

14. **nit** — `server/src/jobs/pdfIngestion.ts:163-169` (`extractJson`)
    - `replace(/```(?:json)?/g, "")` strips fence markers anywhere, so a legitimate backtick
      sequence inside a JSON string value would be corrupted. Unlikely with these prompts.
    - Fix: only strip leading/trailing fences.

### Clean

- Test coverage of the riskiest paths is genuinely strong, not vacuous:
  - SM-2: exhaustive — full good-chain (1, 6, 15, 38, 95), ease floor pinning from above and
    at the floor, fail-reset + maturity demotion, manual demotion incl. repeated-demotion
    floor and re-entry to the ladder, input purity, ISO timestamp format, log/state mirroring.
  - Dedupe/normalization: accent/case lemma matching, ñ, multi-word terms, no-lemma fallback,
    surfaced-not-dropped (plus UNIQUE(term,language) enforcement at the schema level).
  - Job resume & per-page retry: completed pages skipped on rerun, retry payload touches only
    the requested page, per-page failure recorded while other pages finish, invalid-JSON
    failure path — all against the real fixture scans, asserting real single-page PDF bytes.
  - Queue: retry/backoff timing, permanent failure with persisted stack, boot recovery,
    missing-handler failure. LlmService: config precedence, per-attempt llm_call rows,
    retryable vs non-retryable, attempts cap, unknown provider.
  - Routes: upload happy path + no-file + non-PDF (no rows created) + retry 200/409/404 +
    an upload→job→extraction-items end-to-end test.
- No error swallowing found: page failures land on source_page.error, error_log, stdout, and
  job progress; the logger's own DB-write failure falls back to stdout; request errors return
  enveloped 4xx/5xx and are logged (sole soft spot is finding #3's status code).
- No `eval`/`Function` over model output; JSON.parse only.
- Duplication between server modules: none observed — queue/LLM retry loops are structurally
  similar but serve different layers; not worth unifying.
