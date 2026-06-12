# Review — Phase-2 feature wave (review-05)

Audit of: `lesson-recording-ui` (bf67b7b), `ask-chatbot` (2396c66), `suggestions`
(818152e), `notes-on-answers` (997b71a), `voice-questions` (ef000e3), plus a light
pass on `lesson-analysis-hardening` (d11ecad) and `nav-add-lessons-suggestions`
(f84507f).

Audit only — no code was changed. Findings verified against `GOAL.md`,
`ARCHITECTURE.md`, and `design/`. Each finding reproduces the logic; items I could
not fully confirm are marked **(unverified)**.

---

## Blockers

None found. SQL is parameterised throughout (no injection at any boundary); no
data-loss path; mutation tools are genuinely gated behind confirmation; uploaded
audio and chat text survive failures. The items below are real but none ship
broken or lose data.

---

## Should-fix

### S1 — Suggestion uniqueness & deck-exclusion keyed on the surface term, not the lemma
`server/src/db/suggestion-queries.ts:134,146`
ARCHITECTURE (`suggestion` entity) is explicit: for words `normalized_key` is
"the lowercase+accent-stripped **lemma**, identical to the `word` normalization
rule", and suggest-time generation "excludes anything already in a deck (join
against `word.lemma_normalized`)". The code instead uses the encountered term:

```
const normalizedKey = normalize(payload.term);          // should derive from lemma
... WHERE term_normalized = ? AND language = ?          // should be lemma_normalized
```

Consequence: a word whose lemma is already in the deck (e.g. suggestion
`corriendo`, deck has `correr`) is **not** excluded and can be proposed; and two
encountered forms of the same lemma can both be suggested. Both contradict the
"never re-suggest / err away from what I know" story (GOAL §5/§6.6).
Fix: compute the key from `payload.lemma` (fall back to term when null) and join
the deck-exclusion against `word.lemma_normalized`.

### S2 — Suggestion "add" failure is swallowed and reported as success
`server/src/routes/suggestions.ts:231-242`
On `action:"add"` the row is marked `added` **first** (line 232), then
`addWordToDeck` runs inside a try/catch that only logs and continues; the route
returns `{ ok: true }` regardless. If the word insert throws, the suggestion is
permanently `added` (so it can never be re-surfaced) yet no `word`/`source` row
exists — a silent no-op presented as success. This is the same failure class
GOAL §16 calls out ("DB write failure: fail loudly… never pretend success").
Fix: attempt the add before flipping status, and surface the error (non-2xx) so
the UI can show it; keep status `pending` on failure.

### S3 — Calibration sample is "recent deck words", not "known/mastered" words
`server/src/db/suggestion-queries.ts:268-273`
`gatherCalibrationSignal` selects the 120 newest `es` words regardless of status.
GOAL §6.1 and the §5 suggestions story require calibration on the owner's
**known and mastered** words ("so I'm not shown words I obviously know"). Newly
added `new`/`learning` words are exactly the words the owner does *not* yet know,
so they weaken the calibration signal.
Fix: filter `status IN ('known','mature')` for the calibration sample (the total
deck count can stay unfiltered).

### S4 — Chat assistant context uses the OLDEST 50 turns, not the most recent
`server/src/routes/chat.ts:180`
`generateAssistantReply` builds history from `listMessages(db, threadId, 0, 50)`,
which is oldest-first with `LIMIT 50 OFFSET 0`. Once a thread passes 50 messages
the model is fed the first 50 and never sees recent turns — the "the AI has
memory of prior conversations" promise (GOAL §5 Ask story) degrades to "memory of
the start of the conversation". Fix: take the most recent N (e.g. order DESC,
limit, reverse) for the prompt window.

### S5 — Thread/message ordering has no deterministic tiebreak
`server/src/db/chat-queries.ts:142-144` (also `listThreads` :94)
`nowIso()` is second-precision (`db.ts:17`), so a user turn and its assistant
reply inserted in the same request usually share `created_at`. `ORDER BY
created_at ASC` has no secondary key, so the two turns' relative order on reload
is unspecified by SQLite. In practice a bare table scan returns rowid order (so it
*usually* renders correctly), but this is fragile — any index on `created_at`, or
a query-planner change, can flip a user/assistant pair. Fix: add `, id ASC`
(messages) / `, id DESC` (threads) as the tiebreak.

### S6 — Bilingual typography not applied inside chat answers
`web/src/components/ChatTurn.tsx:51`; CSS `web/src/components/ChatTurn.css:30`
D4 ChatTurn anatomy: "Spanish inside an answer follows the bilingual rules —
`--font-study` italic on its own line with the hanging indent". The component
renders `content` as one plain `<p class="chat-turn__body">` (sans). The
`.chat-turn__spanish` class exists in the CSS but is never emitted — dead style.
So Spanish in assistant replies reads in the app sans face, breaking Principle 2
("serif is the studied language"). The chat prompt already instructs the model to
put Spanish on its own line, so the lines are detectable; they're just not styled.
Fix: split assistant content on those lines and wrap Spanish lines in
`.chat-turn__spanish`.

### S7 — Lesson duration is never surfaced
`server/src/db/lesson-queries.ts:97` (`durationMinutes: null`)
The read API hardcodes `durationMinutes: null` for both list and (implicitly)
detail. The Lessons spec leads every row with duration ("Lesson · Jun 9 ·
**58 min**", `design/screens/lessons.md`), and `Lessons.tsx:39` only renders the
"· N min" suffix when non-null — so it never appears. If duration isn't stored on
`source` today this is a data-availability gap rather than a query bug, but the
contract's primary list affordance silently can't render. Fix/flag: persist the
clip duration (transcription already computes minutes) and return it here.

### S8 — File-size error message contradicts the voice route's limit
`server/src/app.ts:120` vs `server/src/routes/chat.ts:126`
The voice upload caps at `25 * 1024 * 1024` (25 MB) but the shared `errorHandler`
hard-codes "uploaded file is too large (max **50 MB**)". A 25–50 MB voice clip is
rejected with a wrong limit. Voice rules in D5 require errors to "name what
happened" honestly. Fix: derive the number from the limit, or state the route's
real cap.

---

## Nits

- **N1 — Optimistic toast ignores the real tool result.** `web/src/screens/Ask.tsx:211-217`
  After a confirm the toast always says "Added _term_ to the Spanish deck" as long
  as `toolCall` is present, even when the server receipt is "already in the deck"
  or "Failed to add" (`chat.ts:392-398`). The inline receipt is correct; the toast
  isn't. Gate the toast on `toolReceipt.result`/status.
- **N2 — `get_page_context` is a stub.** `chat.ts:107-109` returns a constant
  "Page context retrieved." and does nothing; the label is already injected via the
  prompt. Harmless but the tool earns its slot only cosmetically.
- **N3 — `lookup_word` normalized compare isn't accent-stripped.** `chat.ts:92-94`
  compares `term_normalized` against `term.toLowerCase()` (no NFD strip), so an
  accented query misses the normalized column. Use the shared `normalize()`.
- **N4 — Chat-added word has no lemma/definition.** `chat.ts:388-391` inserts only
  term/normalized/lang/status/deck. Valid (all NOT-NULL columns covered, verified
  against `001_init.sql`), but unlike the suggestion path (`addWordToDeck`) it
  doesn't auto-fill a definition/lemma, so the word isn't quizzable until edited —
  GOAL's manual-add story auto-fills.
- **N5 — InsightRow deviates from the D4 spec.** `web/src/components/InsightRow.tsx`
  underlines the *entire* said/corrected sentence rather than the differing span
  (payloads carry only full strings), and omits the trailing quiet Button "Ask
  about this" that `components.md` §InsightRow requires.
- **N6 — RecordButton denied/countdown polish.** `web/src/components/RecordButton.tsx`
  `denied` only sets the button `title` tooltip; the spec wants it surfaced "as a
  TextInput error line". The elapsed timer is `--color-incorrect` the whole time,
  not just the last 15 s (the `--warning` class is empty by design comment).
- **N7 — Streaming / "Earlier →" not implemented.** Ask waits for the full reply
  (no token streaming; ChatTurn's `streaming` state is unused), and although
  `hasMoreMessages` is tracked it's never surfaced as the spec's "Earlier →"
  upward lazy-load. Acceptable for v1 but both are in `ask.md`.
- **N8 — Token nits (otherwise clean).** `web/src/screens/Ask.css:159` uses raw
  `64px` where `--space-8` (64px) exists; `web/src/components/InsightRow.css:29`
  uses raw `2px` (no token, but `--space-1`=4px is the nearest). The `8px` dot,
  `1.2s` pulse, and `420px`/`520px` max-widths are raw but match how the contract
  itself states them and have no corresponding token — acceptable.
- **N9 — Suggestion reason line is fully upper-cased.** `Suggestions.css:46-53`
  applies `text-transform: uppercase` to the whole reason; the spec shows only the
  "SUGGESTED ·" lead-in upper and the reason lowercase
  ("SUGGESTED · near your level", `design/screens/suggestions.md`).
- **N10 — POST /api/notes doesn't validate the FK.** `server/src/routes/notes.ts:34`
  a non-existent `quizQuestionId` either FK-fails or makes the post-insert INNER
  JOIN return no row (`notes-queries.ts:48-51` → `toNote(undefined)`), surfacing as
  a 500 rather than a clean 400. **(unverified: depends on `PRAGMA foreign_keys`.)**
- **N11 — Topic suggestion key uses `topicId`, not the normalized name.**
  `suggestion-queries.ts:182`. ARCHITECTURE says "for grammar topics the normalized
  topic name". `topicId` is arguably *more* stable, but it's a contract deviation
  worth a one-line `DECISIONS.md` note.

---

## Clean bill — checked and found correct

- **SQL safety:** every query across chat/suggestion/notes/lesson is parameterised;
  no string interpolation of user input. No `eval` of model output.
- **Notes JOIN-through-quiz_question:** `notes-queries.ts` links only on
  `quiz_question_id`; word/topic resolved by LEFT JOIN with `COALESCE` label; no
  duplicate link columns; `getNotesForWord/Topic` are newest-first `LIMIT 5`. The
  generation jobs genuinely pull them: `quizGen.ts:233/241` and `lessonGen.ts:162/172`
  fetch notes and substitute `{{notes}}`, and `prompts/quiz_cloze.md` /
  `grammar_lesson.md` carry the slot; empty notes → no section.
- **Chat tool safety:** mutations (`add_word_to_deck`) are stored as a pending
  `toolCall` and only executed in `POST …/tool` on `confirm` (`chat.ts:199-223,
  371-401`) — never auto-applied. Read-only tools run silently. The add failure
  path writes a real receipt result (surfaced in-thread), not a silent no-op
  (server side).
- **Thread persistence:** `pageContext` + `title` required at the route
  (`chat.ts:133`) and stored as JSON in `chat_thread` — threads/messages are DB
  rows, so they survive restart.
- **Suggestion never-repeat:** `UNIQUE(item_type, normalized_key)` plus status
  updates (not deletes) mean skipped/added keys persist; `insertWordSuggestion`/
  `insertTopicSuggestion` pre-check existence regardless of status — re-suggestion
  is genuinely blocked. Pool-exhausted returns `{suggestion:null}` → EmptyState.
- **Lesson read API:** newest-first (`ORDER BY id DESC`), counts grouped by
  insight `type`, detail groups by the four types, `getLessonDetail` rejects
  non-`lesson_audio` sources, route returns 400 on bad id / 404 on miss.
- **Voice flow:** multer 25 MB `fileSize` limit + extension allow-list +
  injectable `readAudioDuration` + empty-transcript guard (422) + 404/400/502/503
  paths; `transcribe("voice_question", …)` logs spend via the adapter; transcript
  becomes the user turn and reuses `generateAssistantReply` (so the
  `add_word_to_deck` confirm path is inherited). Per the brief, the absence of a
  `Source(type='voice_question')` row / clip-on-disk is by design and **not** flagged.
- **Component reuse:** Lessons composes WordEntry/InsightRow/JobStatus/EmptyState/
  Button; Suggestions composes WordEntry/Button/EmptyState/Toast; ToolConfirm and
  ChatTurn compose the shared Button. No re-implemented primitives.
- **Microcopy:** Suggestions (tally, "Choosing the next one…", exhausted, error,
  added toast), Ask (context line, tool receipt "ADDED · _term_ · Spanish deck",
  turn failure, voice pending), and Lessons (empty, "Show transcript") match the D5
  table.
- **Token discipline:** the new CSS (InsightRow, ChatTurn, ToolConfirm,
  RecordButton, Ask, Suggestions, Lessons, NoteAffordance) references D2 tokens for
  color/space/radius/type almost everywhere; reduced-motion blocks present where
  animation exists.
- **multer over-limit** is handled by `errorHandler` (413), not an unhandled 500
  (only the message text is wrong — S8).
