# Code Review — review-09 (`75f27f7..HEAD`)

**VERDICT: SHIP-WITH-FIXES** — 0 blockers, 2 should-fixes, 5 nits.

The headline work (gutenberg-kjv-ingestion) is correct on every dimension the
brief flags as money/data-critical: the cost gate is real, the pre-pass is
provably *not* the semantic filter, the job is resumable, and English sources
route into the English deck end-to-end (verified by test, not just by reading).
`bash check.sh` is green here: 75 test files, **664 tests pass**, build clean.
Nothing found rises to a blocker. The should-fixes are an external-boundary
robustness gap and a pre-existing latent retry-route bug; the nits are taste /
single-user-acceptable.

---

## Clean bill — correctness-critical paths traced and found sound

These were read line-by-line (not skimmed) and are correct:

- **Cost gate (GOAL §13 ">$5 / full-book ingest requires confirm").** Two-step
  flow is sound: `POST /api/sources/gutenberg` (`sources.ts:302-380`) fetches,
  strips, persists the source + raw text, and returns `{wordCount, batches,
  estimateUsd}` **without enqueuing any job**. The expensive run only starts on
  the separate `POST /:id/confirm` (`sources.ts:384-426`). Because confirm is a
  distinct explicit user action for *every* Gutenberg ingest, a >$5 spend
  necessarily requires an in-app confirm. The UI (`Ingest.tsx` estimate panel)
  always shows the estimate and adds an emphatic `role="alert"` warning when
  `estimateUsd > 5`. `modelPricing("claude-opus-4-8")` resolves to a real
  `{input:5, output:25}` row, so `estimateGutenbergCostUsd` returns a non-zero
  figure (no silent $0 that would defeat the warning). **Gate verified.**
- **Pre-pass-is-not-the-filter invariant (GOAL §6.1).** `gutenbergPrepass.ts`
  only drops stopwords (`STOPWORDS`), archaic *function* words
  (`ARCHAIC_FUNCTION_WORDS`), `-eth/-est` inflections, and proper-noun-ish
  tokens — all cheap, local, lexical. Genuinely hard vocabulary
  (concupiscence/propitiation/firmament/raiment/habergeon) is deliberately
  absent from every drop list and reaches the LLM. The module header and the
  `prepassCandidates` doc both state the invariant, and
  `gutenbergPrepass.test.ts:86` asserts it ("keeps genuinely difficult
  vocabulary for the LLM to judge"). The LLM rubric in
  `prompts/gutenberg_extraction.md` carries the GOAL §6.1 sentence near-verbatim
  ("advanced, or a word that a reasonable, intelligent college student wouldn't
  know") and the archaic include/exclude extension. **Invariant holds.**
- **Resumability (mirrors `textIngestion.ts`).** `runGutenbergIngestion`
  (`gutenbergIngestion.ts:111-169`) re-derives chunks deterministically from
  `source.transcript` via the pure `gutenbergChunks`, skips `status='done'`
  pages on rerun (`:137`), records per-chunk failures on `source_page` without
  aborting siblings, writes per-chunk job progress (`:157-161`), and throws at
  the end if any chunk failed so the queue retries. No per-chunk text is
  persisted, so resume after a crash is exact. Covered by
  `gutenbergIngestion.test.ts:271` ("resumes: completed chunks are skipped").
- **`en` → English-deck routing (schema-gate-005 + gutenberg).** Migration 005
  is a plain additive `ALTER TABLE source ADD COLUMN language TEXT` + backfill
  `'es'` — safe, no rebuild. `triage-queries.ts` routes by the *source's*
  language: `sourceLanguage()` (`:NULL→'es'`), `deckIdForLanguage()`,
  `materializeWord(... language ...)`, and both dedupe lookups are
  language-scoped. The `'English Vocabulary'`/`'en'` deck is seeded in
  `001_init.sql:273`, so `deckIdForLanguage(db,'en')` resolves. End-to-end test
  `sourcesGutenberg.test.ts:227` confirms a confirmed `learn` word lands in the
  English deck and does **not** false-dedupe against an `es` homograph.
- **Idempotency of `/confirm`.** Guarded by a `COUNT(*) FROM source_page` check
  (`sources.ts:400-411`) → `409 already_confirmed`. Correct for single-user;
  the theoretical double-submit race is irrelevant here.
- **Calibration uses the owner's English known/mastered words.**
  `buildCalibrationSample(db, "en")` (`gutenbergIngestion.ts:184`) is
  language-scoped (`status IN ('known','mature')`). Satisfies §6.1(c).
- **`en` words carry `definition_en`, `definition_es=null`.** Prompt instructs
  it; `parseExtraction` preserves nulls; verified by
  `gutenbergIngestion.test.ts:207`.
- **Coverage indicator (§6.1(g)).** `getSourceCoverage` (`queries.ts:176`)
  computes triaged/total + kept + untested (no `card_state`/`review_log` row);
  surfaced quietly on Triage (`Triage.tsx:546`) and refreshed after confirm.
- **Raw book text stored under the data dir (§6.1(h)).** Written to
  `<dataDir>/books/<id>.txt` and `source.transcript` (`sources.ts:359-366`).
- **ffmpeg re-split (commit 1a311f4).** Loop is bounded (`maxAttempts=3`),
  strictly returns only when `largestChunkBytes <= maxBytes`, shrinks the target
  each attempt, uses a fresh per-attempt temp subdir removed before the next,
  and throws the existing **non-retryable** error only after the bound is
  exhausted. Terminates and respects the size limit. Sound.
- **Mobile guard (commit 3bdbe0f).** `useIsPhone` uses
  `matchMedia("(max-width: 639px)")` (= design `bp-tablet` 640px, not
  user-agent), SSR-guarded, with a `change` listener. `/ingest` renders an
  `EmptyState` notice below 640px and every phone entry point is hidden. Matches
  `design/screens/ingest.md` intent.
- **Token discipline (Ingest.css / Triage.tsx).** New `.ingest__estimate*`
  rules use `var(--space-3)`, `var(--text-md)`, `var(--color-ink)`; no raw
  hex/px introduced. UI reuses existing `Button`/`TextInput`/`EmptyState`
  components rather than re-inventing. Microcopy is quiet and dictionary-toned.
- **dead-CSS nit (0d89c1e):** removes 5 lines of unused `Review.css`. Trivial,
  correct.

---

## Should-fix

### S1 — Gutenberg fetch has no timeout; a hung connection hangs the request
`server/src/routes/sources.ts:74-83` (`defaultFetchGutenberg`)

`fetch(url, { headers, redirect: "follow" })` sets a polite UA and follows
redirects (good), but has **no timeout / AbortSignal**. Project Gutenberg
occasionally stalls mid-transfer; with no deadline the `POST /api/sources/
gutenberg` request hangs indefinitely (the estimate step the owner is waiting
on), and the only recovery is killing the tab. GOAL §16 asks failure modes to
be surfaced, not silently stalled.

*Fix:* pass `signal: AbortSignal.timeout(30_000)` (Node ≥18 has it) to `fetch`;
the existing `catch → 502 fetch_failed` already handles the resulting abort
cleanly, so this is a one-line change with no new branch.

### S2 — Per-page retry route enqueues the **PDF** handler for any source type
`server/src/routes/sources.ts:450-476` (`POST /api/source-pages/:id/retry`)

This route unconditionally calls `enqueuePdfIngestion(...)` regardless of the
owning source's type. A failed Gutenberg (or pasted-text) chunk retried through
it would run `runPdfIngestion` against a non-PDF source. This is **pre-existing**
(the route predates this diff and already mis-serves `text` sources) and is
**not currently reachable from the UI** (no front-end calls
`/api/source-pages/:id/retry`; the Ingest screen relies on the queue's
job-level retry, which *does* re-run the correct handler). Flagging it because
the Gutenberg work widens the blast radius — there are now two source types this
route would mis-handle if it ever gets wired up.

*Fix:* dispatch by `source.type` (pdf→`enqueuePdfIngestion`,
gutenberg→`enqueueGutenbergIngestion` with `pageIds`, text→`enqueueTextIngestion`),
or remove the route until a UI needs it. Out of this branch's strict scope —
recommend a follow-up ticket rather than touching it here.

---

## Nits

### N1 — Job reaches directly into the Anthropic adapter for pricing
`server/src/jobs/gutenbergIngestion.ts:3` imports `modelPricing` from
`../llm/anthropic.js`. The returned shape (`{input,output}`) is provider-neutral
so this is not a §6.7 *type* leak, and it reuses the same table that costs real
`llm_call` rows (consistent with existing code). But the pricing table only
contains `claude-*` models, so if the active provider were swapped, the model
resolves via `LlmService.resolveTaskConfig` while pricing silently falls to
`null → estimate 0`. Acceptable while Anthropic is the only adapter; ideally the
estimate would query the active provider's pricing through the `LlmService`
seam. Low priority.

### N2 — Cost-estimate token constants are rough and unvalidated against a real KJV run
`server/src/jobs/gutenbergIngestion.ts:25-27` (`PROMPT_OVERHEAD_TOKENS=800`,
`TOKENS_PER_CANDIDATE_IN=3`, `TOKENS_PER_CANDIDATE_OUT=20`). The comment is
honest that these only need ballpark accuracy, and the hard §13 gate (the
confirm step) fires regardless. But the `>$5` *warning* in the UI depends on
this figure; if the amortized output-per-candidate is materially off for a
high-keep archaic book, the warning could fire late or early. Consider
recording the actual tokens from the first real KJV run in `DECISIONS.md` and
trimming the constants. Not a defect — the gate itself is the confirm.

### N3 — Repeated estimate calls create duplicate `gutenberg` sources + stored files
`server/src/routes/sources.ts:302-380`. Each `POST /api/sources/gutenberg`
inserts a fresh source row and writes `books/<id>.txt`, even for a book already
fetched. Re-fetching the same book (e.g., the owner re-estimates) accumulates
orphan sources and files. No data loss; single-user-acceptable clutter. Could
dedupe on `(type='gutenberg', ref)` if it becomes annoying.

### N4 — Pre-pass can drop a real word that only ever appears capitalized mid-sentence
`server/src/jobs/gutenbergPrepass.ts:140-152`. The proper-noun heuristic drops
capitalized mid-sentence tokens. A genuine vocabulary word that appears *only*
in that position (never sentence-initial, never lowercased) would be lost before
the LLM sees it — a small nick in the "over-keeping is fine, never over-drop"
intent. In practice KJV vocabulary recurs sentence-initially at verse starts
(then the lowercased form is kept via `seen`), so the real-world loss is
negligible. Noted for completeness.

### N5 — `/confirm` trusts the client for the cost decision
`server/src/routes/sources.ts:384-426` performs no server-side `>$5` re-check; a
direct POST bypasses the UI warning. This is **by design** for a single-user LAN
app (GOAL §3 "no hardened security posture") and the same person drives both
ends. Mentioned only so it's a conscious choice, not an oversight.

---

## Tests — coverage assessment

Strong. New behaviors are covered, not just compiled:

- `gutenbergPrepass.test.ts` — URL/ID resolution, boilerplate strip, title
  derivation, and the four pre-pass invariants incl. the explicit
  "token-reduction, NOT the semantic filter" keep-test.
- `gutenbergIngestion.test.ts` — rubric-near-verbatim assertion, archaic
  guidance, output-JSON keys, chunking/counts, cost scaling + unknown-model→0,
  English-item materialization, ~50-batch grouping, per-chunk failure→throw,
  and resume.
- `sourcesGutenberg.test.ts` — estimate-without-starting-job, bad/missing ref,
  502 on fetch failure, confirm enqueue, 409 already-confirmed, 404 unknown,
  end-to-end **kept words → English deck**, and coverage counts.
- `ffmpegSplit.test.ts` — recovery (small maxBytes → all chunks sub-limit) and
  bounded-attempts unsplittable → non-retryable throw.
- `App.test.tsx` / `Home.test.tsx` / `Review.test.tsx` — phone/desktop
  `matchMedia` cases for the ingest guard.
- `migrate.test.ts` — asserts 005 in the migration list and the `source.language`
  column.

No Phase-3 acceptance criterion from GOAL §5 appears uncovered by this diff.

---

## Provenance — commands run

```
git log --oneline 75f27f7..HEAD | wc -l   →  20
git diff --stat 75f27f7..HEAD
git show 88abb9d -- <gutenberg files>      # prompt, jobs, routes, queries, llm, web, shared
git show 788f137 -- <triage-queries / migration 005 / triage route>
git show 1a311f4 -- server/src/transcription/ffmpegSplit.ts
git show 3bdbe0f -- web/src/hooks/useIsPhone.ts web/src/App.tsx web/src/screens/Home.tsx
git show 0d89c1e --stat
# read in full: prompts/gutenberg_extraction.md, gutenbergIngestion.ts,
#   gutenbergPrepass.ts, sources.ts, textIngestion.ts (helpers), all *.test.ts above
bash check.sh                              # → 75 files, 664 tests pass, build OK
```

`git log --oneline 75f27f7..HEAD | wc -l` = **20**
