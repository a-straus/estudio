# Review 07 — strong-model audit of `820158a..HEAD`

Scope: the 4 net-new product surfaces that landed since review-06 —
**prod-serve-web-guard**, **review-flow-polish**, **ask-history-delete**,
**llm-latency-tuning**. Each change was traced line-by-line against the real
code and the GOAL/ARCHITECTURE/design contracts. Docs-only and test-only
commits, and the already-reviewed review-06 fix wave that also falls inside
this range (`suggestion-deck-exclusion-fix` → `suggestion-queries.ts`/
`suggestions.test.ts`; `lessons-duration-rounding` → `Lessons.tsx`
`Math.round`), are out of scope and were not re-audited.

## Verdict: **SHIP** — 0 BLOCKER, 0 SHOULD-FIX, 3 NIT + 1 watch-item

No correctness, data-loss, contract, or token-discipline defect found in the
four reviewed surfaces. The accuracy-sensitive change (llm-latency-tuning) is
safe: the tasks that literally drive the §14 ≥90%-accepted metric were *not*
touched. Details below.

---

## 1. prod-serve-web-guard (server) — CLEAN

Files: `server/src/index.ts`, `server/src/app.ts` (+`app.test.ts`).

- **Boot warning** (`index.ts:64-73`): in `production` only, checks
  `../../web/dist/index.html` relative to `import.meta.url` and `logger.warn`s
  if absent. Path matches `app.ts:33`'s `webDistDir`
  (`../../web/dist/`, "two levels up from both server/src/ and server/dist/"),
  so the two checks agree.
- **Openable-URL boot log** (`index.ts:89-91`): logs the URL inside the
  `listen` callback, production-only. ✓ §6.9 (surfaced, not swallowed).
- **SPA 503 fallback** (`app.ts:101-114`): the catch-all `app.get(/.*/)` now
  `fs.existsSync`-checks `index.html`; present → `sendFile` (normal path,
  byte-identical to before); missing → `503 text/plain` with the actionable
  `Run \`npm run build\`` message. The `webDistDir` test seam (`opts.webDistDir`)
  is threaded into both `express.static` and the fallback, so the two code
  paths can never diverge on directory.
- **No regression to the normal serve path**: when the build exists, behaviour
  is identical (static assets first, then `index.html` for SPA routes). The
  503 is correctly *not* an `/api` route, so the `{error:{message,code}}` JSON
  convention (ARCHITECTURE "API") doesn't apply — plain text is right here.
- Tests (`app.test.ts`) cover both branches (200-with-build, 503-without).

**NIT-1.** `index.ts:90` logs `http://localhost:${config.port}`. The phone is
a co-primary surface (§8) and reaches the server over LAN/Tailscale, not
`localhost`; the boot line is therefore only directly clickable on the host.
Harmless (the README carries the LAN/Tailscale address per the hygiene bar),
but a host-LAN hint here would be friendlier. Not worth a code change.

## 2. review-flow-polish (web) — CLEAN

Files: `web/src/screens/Review.tsx`, `Home.tsx` (+ tests).

- **Instant grade, `Card` (MC)** (`Review.tsx:171-181`): `check()` replaced by
  `select(i)` which `setSelected`, computes `correct`, `setAnswered(true)`, and
  calls `onGrade(card, correct?"good":"fail")` in one shot. Guard
  `if (!optionSet || answered) return` prevents double-grade. The option
  `onClick` (`:286`) and keyboard 1–4 (`:215-217`) both route through it.
  This mirrors `Quiz.tsx:131` `select()` exactly — parity confirmed.
- **Instant grade, `ClozeCard`** (`Review.tsx:342-353`): same pattern,
  normalize-compared, logs `cloze.questionId` via the 3-arg `onGrade`. A new
  keyboard effect (`:364-381`) was added to `ClozeCard` (it had none before),
  matching `Card`'s map.
- **"Check answer" removed / "Don't know" kept** (`:299-303`, `:426-430`):
  before-answered action region is now just the quiet "Don't know" Button. ✓
  matches amended review.md region 4.
- **Keyboard map (D5)** (`:199-224`): 1–4 pick+grade; `Enter` advances *only
  once answered* (`if (answered) { if Enter onNext() }`); Space flips in
  flip-card mode; `d` = don't know. The stale `Enter→check()` binding is gone.
  Input/textarea/select are correctly excluded from the global handler.
- **Flip-card fallback intact** (`:204-209`, `:233-266`): `<4`-card / no-cache
  decks still self-grade with the three Buttons; instant-grade only applies in
  `choice`/`cloze` modes. No regression.
- **Home autostart** (`Home.tsx:64`): `Start review` → `/review?autostart=1`
  only when `due > 0` (the else branch routes to `/quiz`). ✓
- **Review reads autostart** (`Review.tsx:486-493`): `data.items.length > 0 &&
  autostart ? "active" : "landing"`. This also fixes the pre-existing no-op
  `length===0 ? "landing" : "landing"` ternary. When autostart is set but the
  queue drained to 0 (stale Home count), it falls back to `landing` and the
  empty state — graceful, no crash.
- **No swallowed grade/persist errors** (`:531-553`): `handleGrade` /
  `handleClozeGrade` call `submitReview(...).catch(onSaveError)`, and
  `onSaveError` (`:519-522`) raises an error Toast. Local grade is optimistic
  UI; persistence failure is surfaced. ✓ §12/§16.
- **Token discipline**: no CSS/visual values added in this surface (logic-only
  diff); existing token-based styling untouched.
- "Explain why" is absent from the plain-MC `Card` after-answer region, but
  that is pre-existing (def-match review cards carry no cached explanation;
  `ClozeCard` retains its `explain` panel). Not introduced here, not a finding.

## 3. ask-history-delete (server + web) — CLEAN

Files: `server/src/db/chat-queries.ts`, `routes/chat.ts`,
`web/src/screens/Ask.tsx`/`Ask.css`/`askApi.ts` (+ tests).

- **`deleteThread`** (`chat-queries.ts:222-229`): wraps `DELETE chat_message …`
  then `DELETE chat_thread …` in `db.transaction()` — atomic, messages-first
  (no `ON DELETE CASCADE`, as the brief states). Returns `changes > 0`.
  Atomicity verified by test (`chat.test.ts` asserts `chat_message` count 0
  after delete). ✓
- **Route** (`chat.ts:175-187`): `DELETE /api/chat/threads/:id` →
  `getThread` null ⇒ `404 not_found`; else `deleteThread` + `204` (no body).
  Matches the brief's 404/204 contract. `id` parsing (`Number(req.params.id)`)
  is consistent with every other handler in the file (`:159,179,251,280,363`),
  so malformed ids behave no differently than existing routes — not a new gap.
- **No-silent-loss on failed delete** (`Ask.tsx:243-256`): `handleDeleteThread`
  **awaits** the server, *then* removes the row; on throw it shows
  `"Couldn't delete conversation."` error Toast and leaves the row in place. ✓
  §16. (Note: the brief calls this "optimistic removal", but the code is
  actually confirm-then-remove — strictly *safer* than optimistic, since a
  failed DELETE can't leave the UI claiming a still-present thread is gone.
  Discrepancy is in the brief's wording, not a defect.)
- **Open-thread-deleted can't strand the UI** (`Ask.tsx:247-251`): if
  `thread?.id === id`, it resets `view="list"`, `thread=null`, `messages=[]`.
  ✓ matches amended ask.md ("if the currently-open thread is the one deleted,
  return to the list"). Row otherwise leaves the list in place. ✓
- **Affordance & token discipline** (`Ask.tsx:290-296`, `Ask.css`): trailing
  `×` button, `aria-label="Delete conversation"`, colour
  `var(--color-ink-faint)`, `min-height/min-width: var(--hit-target)` (≥44px
  tap target, §7), `:focus-visible` via `var(--color-focus)`. The row was
  refactored `<li class=ask__thread-row>` (flex container) wrapping a
  `ask__thread-row-open` button + the delete button, so the open-row click and
  the delete click don't nest/overlap. All values are tokens — no raw visuals.
  ✓ matches amended ask.md region 3 ("a `×` in `--color-ink-faint`").
- **No confirm dialog** (owner-chosen): test asserts `window.confirm` is never
  called and a regression test confirms the row body still opens the thread. ✓

## 4. llm-latency-tuning (server) — CLEAN (accuracy assessed)

Files: `server/src/llm/service.ts` (+ 2 `service.test.ts` assertions).

- **Diff is exactly two lines** (`service.ts:39-40`): `chat`
  `claude-sonnet-4-6 → claude-haiku-4-5`; `suggestion_select`
  `claude-fable-5 → claude-sonnet-4-6`. All 9 other `TASK_DEFAULTS` are
  byte-identical.
- **Every quality-critical batch/grading task is untouched** — verified
  against the current `TASK_DEFAULTS`: `pdf_extraction`,
  `page_classification`, `text_extraction`, `word_definition`,
  `grammar_curriculum`, `grammar_lesson`, `quiz_cloze`, `lesson_analysis` all
  remain `claude-fable-5`; `quiz_grading` remains `claude-sonnet-4-6`. ✓
- **§14 ≥90%-accepted metric is NOT at risk.** That metric is explicitly
  "auto-filled **definitions** and generated **quiz questions** accepted
  without correction" — driven by `word_definition` and `quiz_cloze`, **both
  still `claude-fable-5`**. (The brief's framing that `suggestion_select`
  "drives the §14 metric" overstates it: suggestion add/skip is not the §14
  acceptance metric; the literal drivers were left on the strongest model.
  This is the reassuring finding for the orchestrator.)
- **§3 C1-accuracy is NOT at risk.** Goal-1 C1 quiz accuracy flows from quiz
  generation/grading (`quiz_cloze` fable-5, `quiz_grading` sonnet-4-6) and
  vocabulary definitions (`word_definition` fable-5) — none downshifted.
- **Override path intact** (`service.ts:80-…` `resolveTaskConfig`): precedence
  is `setting` row `llm.<task>` > `LLM_<TASK>_*` env > built-in default, with
  models never hardcoded at call sites (ARCHITECTURE "LLM layer"). Any task,
  including `chat`/`suggestion_select`, can still be pinned to any
  model/provider by config alone. ✓ The swap is logged in DECISIONS.md
  (iteration 143 entry), satisfying the §11/§13 "config swap → note it" rule.

**WATCH-1 (no action).** `suggestion_select` fable-5 → sonnet-4-6 is a genuine
capability downshift for the level-calibrated "which word/topic to suggest
next" reasoning. sonnet-4-6 is strong enough that this is a reasonable
latency/cost trade, and it is fully reversible via the override path above, but
the one observable risk is a lower suggestion **accept rate** (suggesting words
the owner already knows → more "skip"). Worth spot-checking once real
suggestion history exists; not a fix.

**WATCH-2 (no action).** `chat` → `claude-haiku-4-5` must still drive the Ask
tool set (`add_word_to_deck`, `lookup_word`, `get_page_context`). Haiku 4.5
handles tool-use well, so this is fine; flagged only so the orchestrator knows
chat answer quality + tool-call reliability are the thing to watch if Ask
feels worse, and the fix is a one-line/​config revert.

---

## Coverage / clean-bill list (what was verified correct)

- prod guard: boot warn path, openable-URL log, 503 fallback message + status,
  test-seam wiring, normal-serve no-regression, both unit tests.
- review flow: `Card.select`, `ClozeCard.select`, Quiz parity, removed "Check
  answer", kept "Don't know", D5 keyboard map (1–4 / Enter / Space / D),
  flip-card fallback preserved, Home `?autostart=1` gating, Review autostart→
  active phase + drained-queue fallback, grade/persist error surfacing.
- ask delete: transactional `deleteThread` atomicity, 404/204 contract, id
  parsing parity, confirm-then-remove no-silent-loss + error Toast,
  open-thread-deleted UI reset, `×` affordance tokens + ≥44px tap target +
  focus ring, no-confirm + row-open regression tests.
- llm tuning: 2-line diff confirmed, 9 untouched defaults confirmed, all 9
  named quality-critical tasks confirmed on their prior models, override
  precedence intact, DECISIONS.md logged.

## Findings index

- **BLOCKER:** none
- **SHOULD-FIX:** none
- **NIT-1:** prod boot log uses `localhost`, not the LAN/Tailscale address the
  phone needs (README covers it; cosmetic).
- **WATCH-1:** suggestion accept-rate after `suggestion_select`→sonnet (spot-
  check later; reversible).
- **WATCH-2:** Ask answer quality + tool-call reliability after `chat`→haiku
  (reversible).
