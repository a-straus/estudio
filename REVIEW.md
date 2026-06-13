# Review-10 — audit of english-placement + mochi-import + gutenberg truncation fix + supporting merges

**Verdict: SHIP-WITH-FIXES** — the §14-gating Gutenberg truncation fix and the English placement
assessment are correct and well-tested. The Mochi importer has two real defects: imported cards are
written into a status (`learning`) that the contract requires to carry a `card_state` row but none is
created, so the ~300 cards never enter the review rotation (only a per-card manual "I forgot this"
rescues them); and malformed Mochi rows are silently dropped, violating GOAL §16. Both are small fixes
local to one feature.

Scope audited: `git diff 34272c6..HEAD`. `bash check.sh` run this session → **717 passed (80 files), green.**

---

## Blocker

### B1. Mochi-imported cards are orphaned from the review queue (status `learning` with no `card_state`)
`server/src/jobs/mochiImport.ts:156` inserts every imported card with `status: "learning"`.

Per ARCHITECTURE.md (`word` lifecycle, lines 92–96): a `learning` word **must** have a `card_state`
row — that row is what the review-queue builder creates when it promotes a `new` word. The importer
calls only `insertWord` and never creates `card_state`. The consequences (traced):
- `server/src/db/srs-queries.ts:81` — the due-queue reads `FROM card_state cs JOIN word w`. No
  card_state → never in `dueCards`.
- `server/src/db/srs-queries.ts:92` — the promotion query is `WHERE ... status = 'new'`. A `learning`
  word is never a promotion candidate.
- `server/src/srs/queue.ts:48` (`buildReviewSession`) only ever promotes `newWords`.

Net: imported cards land in `learning` limbo — **never scheduled, never quizzed, never surfaced**. The
only recovery is tapping "I forgot this" on each card individually (`/api/words/:id/demote`,
`srs.ts:209`, which back-fills a card_state) — clearly not the intent of "so history isn't thrown away"
(§5 Mochi story; §15 release DoD lists Mochi import). This also violates the documented lifecycle
invariant.

**Fix:** import as `status: "new"` (mirroring triage "learn" → `new`, per ARCHITECTURE.md line 92), so
the queue builder promotes them and creates `card_state` automatically. The placement seeder gets this
right by using `status: "known"` (`placement.ts:269`) — `known` legitimately needs no card_state — which
is exactly the contrast that exposes the Mochi choice as wrong. Update the assertion in
`mochiImport.test.ts:135,142` (currently pins `status: "learning"`).

---

## Should-fix

### S1. Malformed Mochi rows are silently dropped — violates GOAL §16
`server/src/jobs/mochiImport.ts:79` — `if (term === "") continue;` discards any card whose content/name
yields no term. The dropped rows appear in **no** counter: `ImportMochiResult` reports
`{ imported, duplicates, total }` where `total = parsed.cards.length` (line 165), and `parsed.cards`
already excludes them. `mochiImport.test.ts:69` ("skips a card whose term is empty after trimming")
locks this in as intended behavior.

GOAL §16 ("Mochi duplicates and malformed rows → import report, nothing dropped silently") and this
review's own VERIFY item require malformed rows to be **reported**. A curated ~300-card export with an
image-only or one-sided card would lose rows with zero trace.

**Fix:** count skipped/malformed rows in `parseMochiExport` (e.g. return `skipped: number`), thread it
into `ImportMochiResult` as `malformed`, and surface it in the import report the route returns
(`sources.ts:205`) and the UI. Add a test asserting the skipped count is reported, not absorbed.

### S2. Placement climb path can re-serve an already-completed band (identical cached words)
`server/src/placement/adaptive.ts:44–51` — the climb branch has no "already visited" guard, unlike the
descend branch (lines 60–63, tested at `adaptive.test.ts:53`). Trace: C1 served and failed
(`≤1/3` → descend to B2), then B2 passes (`≥2/3` → climb), `currentIdx(B2)=0` → `nextBand = BANDS[1] =
C1`. C1 is re-served. Because band word lists are cached per band (`placement.ts:27`,
`bandCacheKey`), the user is shown the **same 6 words they already answered**.

It is bounded (the `MAX_BANDS` cap at line 36 forces `done` by 4 bands / 24 words), so not infinite —
but it wastes a band and re-asks identical words for the plausible "erratic answerer" pattern (C1 fail
then B2 pass). No test covers this descend-then-climb-re-serve case.

**Fix:** mirror the descend guard — if `BANDS[currentIdx + 1]` is already in `results`, return
`{ done: true, level: estimateLevel(results) }`. Add a unit test for the C1-fail → B2-pass path.

---

## Nit

### N1. Text-page retry re-detects language instead of reading persisted `source.language`
`server/src/routes/sources.ts:533` — `const language = detectLanguage(source.transcript ?? "")`. Since
migration 005 added `source.language`, a retry recomputes the language heuristically and could diverge
from the language chosen at the original enqueue (request value or first detection). Prefer reading the
stored `source.language` for consistency with the initial run. (gutenberg/pdf retry don't have this
issue — they don't carry a per-run language.)

### N2. No end-to-end assertion that `maxTokens` reaches the provider call
`service.test.ts:107` asserts `resolveTaskConfig("gutenberg_extraction").maxTokens === 16384` (good),
but no test asserts the resolved value is actually passed into `provider.vision/complete` params. The
pass-through is correct by code reading (`service.ts:184–186` → `anthropic.ts:67`), but a
`provider.calls[0].maxTokens === 16384` assertion would lock the plumbing against regression.

### N3. Placement `/complete` creates a `manual` source row on every call
`placement.ts:225` inserts a `source` (type `manual`) on each completion, including re-calibrations and
runs that seed 0 words; the row is never linked to the seeded words (the comment at 223–224
acknowledges `insertWord` has no `source_id` param). Harmless provenance clutter; the contract leaves
this fine, but each "Run again" leaves an orphan source.

### N4. Cosmetic — double semicolon
`server/src/placement/adaptive.ts:24` ends with `;;`. (Prettier/ESLint pass, so non-blocking.)

---

## Clean bill — traced and correct

**Gutenberg truncation fix (§14-critical) — fully verified:**
- **maxTokens plumbing is complete.** `TaskConfig.maxTokens` (`service.ts:33`) → `gutenberg_extraction`
  default `16384` (`service.ts:60–64`) → `resolveTaskConfig` preserves it via
  `override?.maxTokens ?? def.maxTokens` (`service.ts:131`, so setting/env overrides still win) →
  `run()` destructures and forwards `{ maxTokens }` to `provider.complete/vision` (`service.ts:173,
  184–186`) → Anthropic adapter applies `max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS (8192)`
  (`anthropic.ts:67`). `gutenbergIngestion.ts:181` calls `llm.vision("gutenberg_extraction", …)`, so
  the live KJV path gets 16384. The 200-candidate ≈ 8k-token rationale in the code comment matches the
  symptom.
- **extractJson now fails loudly, not a silent drop.** `textIngestion.ts:226–249` catches the
  `JSON.parse` throw and re-throws a descriptive error naming likely token-cap truncation with
  `length=` and the JSON `tail`. The "no JSON" guard (line 233) is preserved. Tested with a genuinely
  truncated/unterminated string (`textIngestion.test.ts:47–62`) and a no-JSON refusal
  (`textIngestion.test.ts:64`), asserting it is a plain `Error`, not a leaked `SyntaxError`. This is a
  real over-long-response exercise, not a happy-path stub.
- **Per-chunk fault tolerance stays, failures are visible.** `gutenbergIngestion.ts` (and the mirrored
  `textIngestion.ts:165–185`) records a failed chunk on `source_page` (`status='failed'`, `error=…`),
  `logger.error`s it, continues remaining chunks, then **throws at the end** so the queue retries and
  the failure is surfaced — never swallowed (`textIngestion.test.ts:268,363`).

**English placement assessment:**
- Adaptive band logic is correct: starts C1 (`adaptive.ts:32`), climbs at `≥2/3`, descends at `≤1/3`,
  stops in the clear boundary (`1/3 < ratio < 2/3`), caps at `MAX_BANDS=4` / 24 words, descends only to
  unvisited bands, and `estimateLevel` = highest band with majority known (floor B2). Exhaustively
  unit-tested (`adaptive.test.ts`), aside from S2's gap.
- Seeded words use `status='known'` and **no** card_state (correct — `placement.ts:269`, asserted at
  `placement.test.ts:230`); dedupe by normalized lemma **and** term against existing `en` words via the
  shared `normalize()` (`placement.ts:235–257`). Routes to the English deck (`deckIdForLanguage("en")`),
  `insertSource(type='manual', language='en')`, no schema DDL.
- `english_placement` task defaults to `FABLE_REPLACEMENT` (`service.ts:73`); prompt keeps the
  boundary-of-knowing college-educated rubric (`prompts/english_placement.md`), appropriate for a
  calibration probe.
- `Placement.tsx` reuses contract components (`WordEntry`, `Button`, `EmptyState`) and design tokens;
  no raw hex/rgb and only `max-width`/breakpoint px values that match the established convention across
  the other screen CSS files. `window.location.href` navigation matches the rest of `web/src/screens`.
  Using `WordEntry` rather than `ReviewCard mode="yesno"` is the right call here — placement asks
  "do you know this word" *without* revealing a definition, so the answer-reveal yesno card would be
  wrong.

**Mochi import (apart from B1/S1):** `.mochi` ZIP → `fflate.unzipSync` → `JSON.parse` of the
Transit-JSON `data.json`, reading the `~:`/`~#list` keys directly; unreadable ZIP / missing data.json /
bad JSON / missing `~:decks` all throw → route returns 400 (`mochiImport.ts:27–50`, `sources.ts:204–215`).
Curated cards import with `definitionOrigin: "owner"`, **no LLM call**. Duplicates deduped by normalized
term against existing en lemma+term sets and within the batch, and **counted** in the report
(`mochiImport.ts:141–146`). Routes to the English deck. No schema change.

**Supporting:** Gutenberg estimate fetch has `AbortSignal.timeout(30_000)` (`sources.ts:79`) with an
abort-path test. The `/api/source-pages/:id/retry` dispatch correctly branches on `source.type`
(pdf/gutenberg/text) and 422s unsupported types (`sources.ts:521–547`). The LlmProvider seam holds — no
provider-specific types leak outside `anthropic.ts`; usage/cost/cache logged per call on success and
failure (`service.ts:218–250`); per-task model config intact.
