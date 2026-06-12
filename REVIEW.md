# Review 04 — Design-polish pass + Phase-2 foundation backend

Reviewer: senior-review agent (read-only). Scope audited:

1. **Design-polish pass** — `design-polish-foundation`, `home-nav-footer`,
   `polish-sweep-review-quiz`, `polish-sweep-library-grammar-lesson`,
   `polish-sweep-ingest-triage-system`, `mobile-nav-and-review-landing`.
2. **Phase-2 foundation backend** — `transcription-layer`,
   `lesson-recording-backend`.

Excluded per brief: Phase-1 behavioral fixes, and the Phase-2 UI wave
(`lesson-recording-ui`, `ask-chatbot`, `suggestions` → review-05). Where a
Phase-2-UI artifact (e.g. `AppShell`'s `handleAsk`) was added by a review-05
branch I did not treat it as an in-scope defect.

Overall this is strong, disciplined work. The UI is essentially token-clean and
reuses the shared library faithfully; the transcription/LLM seams and job
idempotency are carefully built and well-tested. One gap blocks the Phase-2
acceptance gate; the rest are should-fixes and nits.

> Note: per brief I did **not** run `check.sh`/tests. Findings are from reading
> the code and diffs only.

---

## Blockers

### B1 · Real ~1-hour lessons cannot be transcribed — chunking/splitting is not implemented

`TranscriptionService` is constructed at boot with **no `splitAudio` injection
and no `maxChunkBytes` override** (`server/src/index.ts:34-36`), so it uses
`defaultSplitAudio`, which passes a recording through only if it already fits the
24 MB per-request cap and otherwise **throws a non-retryable error**
(`server/src/transcription/service.ts:57-73`, cap at `:27`). The ingestion job
catches that and surfaces it as a clean job failure
(`server/src/jobs/lessonAudioIngestion.ts:116-138`).

The result: any recording above ~24 MB fails. A real one-hour tutor lesson is
well above that at any normal bitrate (e.g. 96 kbps voice m4a ≈ 33 min to hit
24 MB; 128 kbps ≈ 25 min), so the headline Phase-2 capability — "audio up to
~60 min … is transcribed" (GOAL §5 Phase-2 Must) — does not work end-to-end.
GOAL §6.7b and §16 explicitly require chunked, resumable, stitched transcription
precisely for "hour-long, code-switching audio." This also blocks the Phase-2
gate in §15 (mine the real recording in `/docs/fixtures/lesson-audio/`).

The failure is **surfaced, not silent** (good — `job.error` is persisted, the
upload survives), and the team documented ffmpeg splitting as a deferred
follow-up in the commit and code comments. I'm still classifying it as a blocker
because it is the core acceptance criterion for the slice the foundation exists
to enable, and the deferral is buried in code comments rather than tracked where
the gate can see it.

**Suggested fix:** wire a real frame-aware splitter (ffmpeg is pre-approved free
OSS, GOAL §16 / §17 "audio extracted locally") injected into the
`TranscriptionService` at `index.ts:34`, with chunk transcription stitched in
order (the service already loops + stitches at `service.ts:157-171`). If it must
stay deferred, record it in `TODO-LATER.md`/`DECISIONS.md` and cap the accepted
upload duration so the limitation is explicit rather than a per-file surprise.

---

## Should-fix

### S1 · Re-analysis silently destroys triage decisions and re-surfaces skipped words

`writeAnalysis` deletes **all** of a source's `extraction_item` rows before
re-inserting fresh `pending` ones
(`server/src/jobs/lessonAudioIngestion.ts:263-265`), including any rows the owner
has already triaged (`decision` set, `word_id` materialized).

In the *current* wiring this is unreachable and therefore safe: the job only
re-runs on failure (i.e. before any triage is possible), and `db.transaction`
makes the rewrite atomic. But GOAL §16 explicitly designs for free re-analysis
("transcript stored verbatim so re-analysis is free"), and ARCHITECTURE makes
`extraction_item` the home of "never-re-extract-what-was-skipped." The moment a
re-analyze path is added (review-05 territory), this wipes triage state and
re-shows skipped words — contradicting "duplicates surfaced, never silently
dropped" (§6.1) and the skip-is-permanent contract.

**Suggested fix:** delete only `WHERE source_id = ? AND decision = 'pending'`
(and the matching `flagged_word` insights), preserving decided rows; or guard
the whole job against re-running once any extraction_item for the source is
decided.

### S2 · Lesson-flagged triage items are missing level / example / likely_known

The standard pipelines compute and store `likely_known`, `level`, and `example`
on each `extraction_item` (`server/src/jobs/pdfIngestion.ts:288-298`,
`textIngestion.ts:268-278`). The lesson path inserts all three as **NULL**
(`server/src/jobs/lessonAudioIngestion.ts:255-285`) because
`prompts/lesson_analysis.md` only returns term/lemma/POS/defs.

GOAL §5/§6.1 say flagged words "flow into the **standard** triage flow," and the
triage UI groups/sorts by the likely-known prediction. Lesson words therefore
land ungrouped, level-less, and example-less — a visibly thinner triage row than
PDF/text words. (Dedupe itself is fine: confirm-time lemma dedupe in
`db/triage-queries.ts` is source-agnostic, so a lesson word that already exists
from a PDF is still caught — §16.)

**Suggested fix:** have `lesson_analysis` return `level` (and optionally an
example sentence), and either run the same likely-known calibration or document
in `DECISIONS.md` that lesson words intentionally skip it.

### S3 · Mining prompt is not seeded with the owner's literal flagging phrases

`prompts/lesson_analysis.md:5` uses generic wording ("did NOT know, asked about,
or that the tutor explicitly surfaced"). GOAL §5, §16, and §17(open-q 2)
specifically require the extraction prompt to list the owner's real self-flag
phrases ("*esta palabra, no sé*" and variants), collected from the first real
transcript and versioned. This is reasonable as a first version (the real
phrases depend on the fixture lesson that gates Phase 2), but it is an explicit
pre-gate tuning step and the Phase-2 DoD names it directly ("mining prompt
seeded from the owner's actual flagging phrases").

**Suggested fix:** once `/docs/fixtures/lesson-audio/` exists, fold the real
phrases into the template and bump its version; track it so the gate isn't
passed with the generic prompt.

### S4 · Masthead nav and footer omit now-built routes

`AppShell`'s primary nav is Home/Review/Library/Grammar/Ingest/System and the
footer links are Ingest/System (`web/src/components/AppShell.tsx:39-52`).
`design/screens/shell.md` specifies a desktop top-bar of
Home·Review·Library·Grammar·**Lessons·Suggestions**·Ingest·Progress·System and a
footer of Ingest·Progress·System·**Docs**. This was the correct call when
`home-nav-footer` landed (those screens didn't exist), but Lessons and
Suggestions have since shipped (review-05) and are now unreachable from the
masthead/footer. (Progress is Phase-4, fine to omit; Quiz is correctly omitted —
shell.md routes it from Home/Review.)

**Suggested fix:** add Lessons + Suggestions to `NAV` and (when relevant) the
footer Docs link, gated on the routes being mounted.

---

## Nits

- **N1 · Whisper cost comment is internally inconsistent.** `openai.ts:14-15`
  says "~$0.40/hr (= 60 * $0.006)", but 60 × $0.006 = **$0.36**. The rate
  (`WHISPER_USD_PER_MINUTE = 0.006`, `:10`) and `estimateWhisperCostUsd` are
  correct; only the comment's "$0.40" (GOAL's round figure) clashes with its own
  arithmetic. Reword to "$0.36/hr (≈ GOAL's ~$0.40 estimate)".

- **N2 · Terminal failures still burn all job attempts.** `JobQueue.run` retries
  purely by count (`server/src/jobs/queue.ts:144-171`) and is blind to
  `TranscriptionError.retryable`, so an oversized-split or unknown-provider
  error (both non-retryable) consumes 3 attempts before `failed`. No money is
  spent (the splitter throws before any HTTP call) — just noisier logs and a
  slower terminal failure. Consider letting handlers signal "do not retry."

- **N3 · Empty transcription result defeats the resume optimization.** If a
  provider returns `""`, the job stores an empty transcript and the next retry
  sees `transcript.trim() === ""` and **re-transcribes**
  (`lessonAudioIngestion.ts:107-108`), re-spending. Real lessons won't be empty,
  but a silent recording would re-bill on every retry.

- **N4 · AppNav active-indicator dimensions are raw px** (`width:24px;
  height:3px; bottom:4px`, `web/src/components/AppNav.css:43-48`). `shell.md`
  describes an "underline-pill" without dimensioning it, so this is sanctioned
  extrapolation rather than a token violation — noted only for completeness
  (`4px` could reference `--space-1`).

---

## Clean bill — verified correct

**Design-polish / token discipline**

- **Token discipline is excellent.** No raw hex/rgb/hsl/oklch anywhere in web CSS
  outside `styles/tokens.css`. The only literal `px` values are
  contract-sanctioned: 1px hairlines, 2px focus outlines/offsets (a D2
  token-usage rule), 8px status dots, 4px progress tracks, 3×12px sparkline
  ticks, and a handful of layout `max-width`s (420/480/520/560px) that
  `components.md` itself specifies literally. No inline-style raw colors in any
  TSX — only computed `%` widths for progress fills and `var(--hit-target)`
  references.
- `styles/tokens.css` materializes `design/tokens.md` **verbatim**, including all
  design-polish additions: `--text-display`, `--leading-display`,
  `--tracking-display`, `--space-9/-10`, `--shadow-3`, `--color-paper-sunken`,
  `--color-accent-strong`, `--header-height`, `--motion-slow`, plus the dark
  `--shadow-*`/`--color-accent-strong` overrides.
- **Component reuse is disciplined.** `SiteHeader`/`SiteFooter` compose the shared
  `Button` (quiet variant) rather than re-inventing; `OverviewCard`/`HomeHero`
  are clean new shared components composed by `Home`; the polish sweeps *removed*
  duplication (dropped the in-body `<h1>` on Quiz/Library/Grammar now the
  masthead owns the title, routed "Explain why" through the quiet `Button`
  instead of a hand-rolled `<button>`). No re-invented one-off markup spotted.
- **Microcopy fixes are on-contract:** cloze prompt corrected to the canonical
  "Complete the sentence." (interaction.md D5), and the "Explain why" panel moved
  to `--font-app` (app-voice, review.md D5).
- **Shell fidelity:** `AppNav` matches shell.md exactly (Home·Review·Library·
  Grammar, phone-only bottom bar, `--color-rule` top hairline, accent active
  state); `SiteHeader` is the sticky flush masthead with a bottom hairline and no
  shadow; the session-takeover "resting states keep full chrome" pattern was
  applied to the Review landing.

**Phase-2 backend correctness**

- **Adapter seam is clean.** `transcription/types.ts` is fully provider-neutral;
  no OpenAI types leak out of `openai.ts`. Retry/backoff lives in the service
  (`service.ts:181-224`); the adapter makes exactly one HTTP request and
  classifies errors sanely (429/5xx + network → retryable, 4xx → not,
  `openai.ts:58-74`). A fresh `Uint8Array` view avoids handing a pooled Buffer's
  siblings to `Blob` (`openai.ts:42-48`).
- **Every transcription_call is logged on success AND failure**
  (`service.ts:227-257`) with status/error/latency/minutes/cost and a null
  prompt_version (correct — transcription has no template). Mirrors the LLM
  layer.
- **Cost math is correct and surfaced upfront:** `WHISPER_USD_PER_MINUTE = 0.006`,
  `estimateWhisperCostUsd` is pure, and the upload route returns
  `costEstimateUsd` on the 201 (`routes/sources.ts:199-204`).
- **LLM-layer conventions honored:** `lesson_analysis` is registered in `LlmTask`
  + `TASK_DEFAULTS` (`claude-fable-5`), resolved per-task (setting > env >
  default), prompt loaded at call time and versioned by template hash, one
  `llm_call` row per attempt, no inline prompt strings; template lives in
  `prompts/lesson_analysis.md` (`llm/service.ts:11-41, 80-99, 126-212`).
- **Multi-table write is atomic and idempotent (within current wiring):** the
  transcript is stored in its own statement so a post-transcribe failure resumes
  without re-spending Whisper (`lessonAudioIngestion.ts:106-142`); the
  insight/extraction_item rewrite is wrapped in a single `db.transaction`
  (`:263-305`), so there is no partial-write corruption; `topic_covered` links to
  a seeded `grammar_topic` by normalized name and is left null on no match (no
  invented categories, `:226-236`); "seen in lessons" is correctly left derived
  (no stored counter), per ARCHITECTURE.
- **Job resumability:** `index.ts` calls `queue.recoverRunningJobs()`, reverting
  `running` → `queued` on boot (`queue.ts:66-74`); the lesson job resumes via the
  transcript-present skip; user input is persisted before the job is enqueued
  (file + source rows written first, `routes/sources.ts:189-197`) so a failure
  never loses the upload; oversized multipart uploads get a clean 413 via the
  `MulterError` handler (`app.ts:113-114`).
- **Audio route validation** rejects non-audio extensions (400 `invalid_audio`)
  and unreadable/duration-less files (400) before persisting anything, and probes
  duration with pure-JS `music-metadata` (no ffmpeg), matching the ffmpeg-free
  v1 constraint (`routes/sources.ts:135-205`, `transcription/duration.ts`).
</content>
