# review-06 — audit of the review-05 fix wave

**Summary: 0 blockers · 2 should-fix · 4 nits.** The wave (suggestion-fixes,
chat-ask-fixes, lesson-notes-nonschema, schema-gate-004) is correct, on-scope,
and free of data-loss bugs. Migration 004 is a clean additive column wired end
to end. Two follow-ups: the new duration label renders a raw float instead of a
whole number, and the lemma-keyed deck-exclusion weakens when a row has no
lemma. Range audited: `5e8845c..HEAD` (a9c99e2, 6150517, 4c4a8d0, 6ac0f51 +
integrates).

## Blockers

None. No silent data loss, no SQL-correctness break, no half-landed mutation.

## Should-fix

### S1 — Lessons duration label shows a raw fractional float, not "N min"
`web/src/screens/Lessons.tsx:39` renders `` ` · ${row.durationMinutes} min` ``
with no rounding, and the value now flowing in is `seconds / 60`
(`server/src/transcription/duration.ts:30`) — an unrounded REAL. The
`lessons.test.ts` case added in this wave asserts `durationMinutes === 58.4`
passes straight through (`server/src/routes/lessons.test.ts:106`), so a real
recording will render "Lesson · Jun 9 · 58.4 min" (or worse,
"58.43333333 min"). The spec example is explicitly the whole-number form
"Lesson · Jun 9 · 58 min" (`design/screens/lessons.md:9,22`). Before this wave
`durationMinutes` was hard-coded `null`, so the label never appeared; the
plumbing fix makes the drift visible.
**Why it matters:** user-visible microcopy/D5 drift from the screen spec on the
primary Lessons list label.
**Fix:** round at the display boundary — `Math.round(row.durationMinutes)` in
`titleLine`, or round when reading in `listLessons`
(`server/src/db/lesson-queries.ts:98`). Keep the stored column precise.

### S2 — Lemma-only deck exclusion misses in-deck words that have no lemma
`server/src/db/suggestion-queries.ts:144-149`. `insertWordSuggestion` now keys
the deck check solely on `lemma_normalized = ?` (key = `normalize(lemma ??
term)`). `insertWord` stores `lemma_normalized = f.lemma ? normalize(f.lemma) :
null` (`server/src/db/word-queries.ts:182`), so any deck word added without a
lemma has `lemma_normalized = NULL` and can never match — and a suggestion whose
own `payload.lemma` is null keys on its surface term, which also won't match a
lemma column. Either gap re-admits a word that is already in the deck. The old
check (`term_normalized = ?`) caught the exact-surface case; this fix trades it
away. Compounding it, the "add" path (`addWordToDeck`,
`suggestion-queries.ts:230`) does no existence check, so accepting such a
re-suggestion inserts a **duplicate** `word` row (the prior "already in deck —
ignore" guard was removed).
**Why it matters:** partial regression of the "never suggest a word already in
the deck" invariant review-05 cleared, and a path to duplicate deck entries.
**Fix:** widen the guard to cover both, e.g.
`WHERE (lemma_normalized = ? OR term_normalized = ?) AND language = ?`, so the
lemma-keyed intent holds while the exact-surface case stays excluded.

## Nits

### N1 — `2px` → `var(--space-1)` is a value change, not a no-op token swap
`web/src/components/InsightRow.css:29,46,57` replace `padding-top: 2px` and
`text-underline-offset: 2px` with `var(--space-1)`, but `--space-1` is **4px**
(`design/tokens.md:90`) — there is no 2px token (smallest is `--space-1`). So
the underline offset and lead padding doubled (2px→4px). Token discipline is
satisfied, but if 2px was the intended hairline offset it is now altered.
Acceptable if 4px is fine; flagging because the commit framed it as a pure
token substitution. No action needed if the larger offset is acceptable.

### N2 — ChatTurn Spanish detection is a lossy heuristic
`web/src/components/ChatTurn.tsx:13` keys the bilingual `--font-study` italic
treatment on a regex for accented chars / `¿¡` (`SPANISH_CHARS`). Spanish
sentences without diacritics ("Yo tengo un gato") won't get the D4 treatment,
and an English line containing an accented loanword could. This is strictly
better than the prior plain-`<p>` (no treatment at all) and the model output
carries no language tags to do better without a contract change, so it's a
best-effort nit, not a regression.

### N3 — Redundant `<br/>` adjacent to a block Spanish line
`web/src/components/ChatTurn.tsx` (in `renderAssistantBody`): English lines emit
a trailing `<br/>` whenever `i < lines.length - 1`, while `.chat-turn__spanish`
is `display: block` (`ChatTurn.css:31`). An English line immediately followed by
a Spanish line therefore gets a `<br/>` *and* the block's own line break,
producing an occasional extra blank line. Cosmetic only.

### N4 — RecordButton denied error duplicates TextInput's error-line style
`web/src/components/RecordButton.tsx` adds a bespoke `.record-btn__error`
(`RecordButton.css:11`) for the denied message, while the spec says render it
"as a TextInput error line" (`design/components.md` §RecordButton). A
`text-input__message--error` style already exists
(`web/src/components/TextInput.css:67`). The microcopy is exact and the color is
the `--color-incorrect` token, so this is a minor reuse nit, not a token break.

## Clean bill

Verified correct (traced, not skimmed):

- **§16 no-silent-loss on suggestion add** —
  `server/src/routes/suggestions.ts:231-244`: `addWordToDeck` runs *before* the
  status flip; on throw it logs and returns `500 add_failed`, leaving the row
  `pending` (the `updateSuggestionStatus` call is now after the try/catch and is
  skipped by the early return). The brief's reorder landed exactly as specified.
- **Migration 004** — `004_source_duration.sql` is a plain nullable
  `ALTER TABLE source ADD COLUMN duration_minutes REAL`: additive, numbered,
  no CHECK/rebuild, existing rows NULL. Fits ARCHITECTURE migration policy and
  is registered in `migrate.test.ts:40`.
- **Duration write** — `jobs/lessonAudioIngestion.ts:147-149` persists `minutes`
  (= `seconds / 60`, `transcription/duration.ts:30`) into `duration_minutes` in
  the *same* UPDATE as the transcript, so the two are atomic. Units are minutes
  on both write and read; no unit mismatch. Resume case (transcript already
  set) correctly leaves duration as-is.
- **Duration read** — `db/lesson-queries.ts:59,98` selects `duration_minutes`
  and null-coalesces (`s.duration_minutes ?? null`); the un-hardcoding is
  complete (no stray `durationMinutes: null`).
- **Notes bad-FK → clean 400** — `routes/notes.ts:45-48` calls
  `quizQuestionExists` (`notes-queries.ts:102`) *before* `insertNote`, returning
  `400 bad_request` "Quiz question not found" instead of letting the
  `quiz_question_id NOT NULL REFERENCES` FK throw SQLITE_CONSTRAINT_FOREIGNKEY
  (500). Ordering is correct and the body-required check still precedes it.
- **InsightRow "Ask about this" wiring** — navigates to
  `/ask?new=1&kind=other&label=<encoded>`; `'other'` is a valid
  `ChatPageContext["kind"]` (`shared/src/chat-api.ts:5`); `Ask.tsx:26-37,133-138`
  reads `kind`/`label`/`new` from `window.location.search` and calls
  `createNewThread`; the `POST /api/chat/threads` route
  (`routes/chat.ts:135-139`) requires only `pageContext` + `title` and stores
  the context as JSON with no kind enum-check, so `'other'` is accepted. The
  `window.location.href` full-nav is necessary (Ask reads `window.location`
  only at mount). End to end sound; both correction and struggle variants carry
  the button.
- **wordDiff** — `InsightRow.tsx` prefix/suffix walk is bounded
  (`sfx < aw.length - pfx && sfx < bw.length - pfx`) so the changed range
  `[pfx, end)` is always non-negative and prefix/suffix never overlap. Identical
  sentences underline nothing; replacements/insertions mark the minimal changed
  span on both you/tutor lines.
- **Most-recent-50 chat window** — `db/chat-queries.ts:151-162`
  `listRecentMessages` orders `created_at DESC, id DESC LIMIT 50` then
  `.reverse()`, yielding the newest 50 in chronological order; `chat.ts:182`
  feeds it to `serializeHistory`. Fixes the prior oldest-50 bug.
- **Determinism tiebreaks** — `listThreads` (`...DESC, id DESC`) and
  `listMessages` (`...ASC, id ASC`) add id tiebreaks for same-second rows.
- **Ask toast gated on real receipt** — `Ask.tsx:213-224` reads
  `toolReceipt.result` and branches on the exact server strings: `Failed...`
  (`chat.ts:397`) → error toast, `...already in the deck.` (`chat.ts:400`) →
  "already in" info, else (`Added "..." to deck.`, `chat.ts:394`) → success.
  `error` variant is supported by Toast (`components/Toast.tsx:10`). No more
  optimistic "Added" on a no-op/failed tool call.
- **RecordButton timer color** — `RecordButton.css:73,78`: timer is now
  `--color-ink`, switching to `--color-incorrect` only via
  `--timer--warning` in the final 15s (was always red). Matches
  `design/components.md` §RecordButton. Denied microcopy is verbatim.
- **lookup_word accent-strip** — `chat.ts:96` now compares
  `term_normalized = normalize(term)` (was `term.toLowerCase()`), so accented
  lookups match the normalized column.
- **Token discipline on the rest of the wave** — `Ask.css:159`
  `64px`→`var(--space-8)` (the calc still totals 128px); new `.suggestion-card__
  reason-label` uppercases only the "SUGGESTED ·" lead-in (`Suggestions.css`,
  `Suggestions.tsx:177,185`); `ChatTurn`/`RecordButton`/`InsightRow` additions
  use only tokens. No raw colors/radii/shadows introduced.
