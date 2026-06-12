# review-08 — audit of net-new product surfaces since review-07

Scope: git range `a806ca7..HEAD`, the five surfaces named in the brief. Read-only
audit; the only file written is this one. I traced real code against GOAL.md,
ARCHITECTURE.md, and the granted `design/` contract. `check.sh` was not run (review
worktree, node_modules absent — expected and ignored per the brief).

**Bottom line: no blockers. 1 should-fix (a low-probability failure mode on the
ffmpeg split path), 2 nits.** The four feature surfaces are correct and conform to
their contracts; the prompt change is safe.

---

## Findings

### SHOULD-FIX

**S1 — An oversized ffmpeg segment aborts the entire transcription non-retryably instead of being re-split.**
`server/src/transcription/ffmpegSplit.ts:118-123`

The splitter sizes segments off the *average* bitrate (`bytesPerSec = total /
totalSeconds`, then `segmentSeconds = floor(0.92*maxBytes / bytesPerSec)`). If any
single emitted segment still exceeds `maxBytes`, the post-split guard throws a
non-retryable `TranscriptionError` and the whole lesson transcription fails with no
recovery. For a constant-bitrate lesson (m4a/AAC, mp3 CBR) the 8% headroom makes this
effectively unreachable — and the real 24.8 MB fixture confirmed the happy path — so
likelihood is low. But the failure is the *worst* shape on the Phase-2 done-gate path:
a single localized bitrate spike sustained across one ~22-min segment would discard the
entire (already-paid-for, after Whisper has run on earlier chunks within the same call)
job rather than degrade.

`retryable: false` is itself *correct* — re-running the identical deterministic ffmpeg
command would reproduce the same oversize, so backoff cannot help. The gap is that the
code gives up rather than recovering locally.

*Concrete fix:* when a segment exceeds `maxBytes`, recursively re-split just that
segment with a smaller target (e.g. halve `segmentSeconds` for that file, or recompute
`bytesPerSec` from the offending chunk's own bytes/duration), instead of throwing. A
minimal version: if any chunk is over the limit, drop the global target by the observed
overshoot ratio and re-run the segment pass once before giving up.

### NIT

**N1 — Dead CSS rule `.review__format-control`.**
`web/src/screens/Review.css:189-191` (added in 71bb49b)

The rule `.review__format-control { width: 100%; }` was added for the landing
`SegmentedControl`, but the `SegmentedControl` rendered in `Review.tsx:702-716` is passed
no `className`, and `SegmentedControl` (`web/src/components/SegmentedControl.tsx:47`) does
not accept/forward one. The rule matches nothing. Harmless but misleading. *Fix:* delete
the rule (the control already lays out fine at its default width — design §3.2b only calls
for "a small SegmentedControl"), or thread a `className`/wrapper if full-width is actually
wanted.

**N2 — Oversized quick-add upload returns 413, not one of the route's documented codes.**
`server/src/routes/transcribe.ts:26-29` + `server/src/app.ts:132-139`

A file over the 25 MB multer limit rejects via `MulterError(LIMIT_FILE_SIZE)`, which the
app-level `errorHandler` turns into a clean `413 { code: "file_too_large" }`. That is a
sane, surfaced error — but it bypasses the route's own 400/422/502/503 contract and the
route's tests don't exercise it. Not a bug (413 is arguably more correct than 400 here),
just noting the contract seam. No change required; flagging for completeness since the
brief asked about the multer limit.

---

## Clean bill — traced and found correct

### 1. lesson-audio-oversized-splitting (fe55e59) — CORRECTNESS-CRITICAL

- **Strict sub-limit guarantee.** Every emitted chunk is re-read and checked against
  `maxBytes` (`ffmpegSplit.ts:117-123`); the pass-through branch returns the original only
  when `input.data.length <= maxBytes` (`:51`). Nothing over the limit can escape.
- **The 92% target + bytes/sec math** (`:77-82`) derives `segmentSeconds` from
  ffprobe-measured duration with `Math.max(1, …)` flooring; sound for CBR audio with 8%
  headroom for per-segment container overhead (see S1 for the VBR edge).
- **Probe / duration edge cases all covered:** ffprobe failure or non-finite/≤0 duration →
  falls back to `input.minutes*60`, and if *that* is also ≤0 it throws a non-retryable
  "could not determine audio duration" (`:68-75`). 0-duration / unreadable input is handled.
- **0 segments** → non-retryable "ffmpeg produced no audio segments" (`:106-111`).
- **Exactly-at-limit input** (`length === maxBytes`) takes the `<=` pass-through branch — correct.
- **`retryable` is set deliberately and correctly:** every throw on this deterministic
  local-binary path is `retryable: false` (probe-fail, 0-segments, oversize-segment, and the
  catch-all wrap at `:138-144`). Retrying identical ffmpeg input cannot change the outcome, so
  non-retryable is right; the service's backoff loop (`service.ts:221`) correctly won't spin on it.
- **Temp-dir cleanup on EVERY path:** the `finally` at `:145-147` `rmSync(tmpDir, {recursive,
  force})` runs on success, on every throw, and `force:true` tolerates a missing dir. The
  pass-through branch returns *before* `mkdtempSync` (`:62`), so no dir is leaked there either.
- **Chunk ordering** is by zero-padded `chunk%03d` filename sort (`:101-104`) and re-stamped as
  `…partNNN…` (`:131`); the input file `in.<ext>` is excluded by the `startsWith("chunk")` filter.
- **Async seam union is safe.** `SplitAudio` widened to `AudioChunk[] | Promise<AudioChunk[]>`
  (`types.ts:59-62`); `service.transcribe` now `await`s it (`service.ts:149`) — `await` on a
  synchronous array is a no-op, so the existing synchronous mock splitters and `defaultSplitAudio`
  still satisfy the type and behavior (the one test that called `defaultSplitAudio` directly was
  updated to `await`, `service.test.ts`). `defaultSplitAudio` is unchanged.
- **Injector** wires `createFfmpegSplitAudio()` into the boot `TranscriptionService` (`index.ts`)
  via the existing `opts.splitAudio` seam; no call-site provider/model hardcoding.
- **execFile with args array** (no shell) for both ffmpeg and ffprobe — no shell-injection surface.
- Dev-only `scripts/validate-lesson-audio.ts` exists and is correctly excluded (not in check.sh).

### 2. mochi-yesno-review (71bb49b)

- **Cross-layer type consistency:** `ReviewFormat = "mc" | "yesno"` defined in
  `shared/src/settings-api.ts:11` and added to `AppSettings`; consumed verbatim in
  `server/src/db/settings-queries.ts` and `web/src/screens/Review.tsx`. No drift.
- **Validation rejects bad values:** `settings.ts:52-59` returns 400 `invalid_setting` when
  `patch.reviewFormat` is outside `ALLOWED_REVIEW_FORMAT`, and the upsert is guarded behind the
  same `!== undefined` check — bad values never persist (test asserts the 400 and that GET still
  returns `mc`).
- **Default `mc` on a fresh DB:** `getSettings` reads the raw row and falls back to
  `DEFAULT_REVIEW_FORMAT = "mc"` when absent or not in the allow-list (`settings-queries.ts:68-72`);
  test "GET returns default reviewFormat 'mc'" covers it.
- **Grade mapping matches design §3.2b and the SM-2 writeback:** "Knew it" → `good`, "Didn't know"
  → `fail` (`Review.tsx:385-390`); keyboard `2/Y`→good, `1/N`→fail (`:358-360`); both flow through
  the shared `handleGrade`/`submitReview` path. No "Easy" and no "Explain why" in yesno — binary by
  design, exactly as the spec requires.
- **No migration:** reuses the `setting` table via `upsertSetting`; no schema change, consistent with
  ARCHITECTURE's `setting (key, value JSON)` and the "no model change" constraint.
- **Token / reuse / microcopy discipline:** the yesno card reuses `ReviewCard`, `CardFront`,
  `CardReveal`, `WordEntry`, `Button`, `SegmentedControl`; the hairline is `1px solid
  var(--color-rule)` (matching the codebase's existing hairline idiom — no border-width token
  exists), the reveal cross-fade uses `--motion-base`/`--motion-ease` with a `prefers-reduced-motion`
  guard, and the tap hint uses `--font-meta`/`--text-sm`/`--color-ink-faint` — precisely the tokens
  §3.2b names. Microcopy ("Do you know it?", "Tap to reveal", "Didn't know"/"Knew it") matches the
  spec verbatim. Cloze cards correctly stay MC in yesno mode (no distractor pool needed; precedence
  handled at `Review.tsx:787-814`).

### 3. quick-add-dictation (60ee9a8)

- **Input validation at the boundary:** multer `memoryStorage` with a 25 MB `fileSize` limit
  (`transcribe.ts:26-29`); missing field → 400 `missing_file`; extension checked against the audio
  allowlist → 400 `invalid_audio` (`:43-48`); duration read through the **injectable**
  `readAudioDuration` seam, and a throw there → 400 `invalid_audio` (`:50-58`). Tests inject the seam.
- **Error contract + microcopy:** 400 (bad/empty/unreadable input), 503 `transcription_unavailable`
  when the service isn't wired, 502 `transcription_failed` on a transcribe throw, 422
  `empty_transcript` on whitespace-only text (`:60-93`). All four documented codes are exercised by
  `transcribe.test.ts`. Web surfaces the server message via `ApiError` (`QuickAddModal.tsx:76`).
- **`quick_add` task label** is passed to `transcription.transcribe` (`:72`) → flows to the
  `transcription_call` spend row; spend stays visible.
- **No chat/LLM coupling leaked:** the route imports only the transcription service + duration seam;
  no `ChatThread`, no `LlmService`, no Source write. It's a clean generic STT endpoint, registered
  once in `app.ts` next to the chat routes.
- **Web wiring:** `transcribeAudio` posts `FormData` (field "file", "voice.webm") to `/api/transcribe`
  (`libraryApi.ts`); `handleRecorded` flips a `transcribing` state, calls it, and `setTerm(text)` on
  success — replacing the term field as dictation should; `RecordButton` is reused with
  `state={transcribing ? "transcribing" : undefined}`. Matches design/components.md QuickAdd intent
  (reuse RecordButton, transcription fills the term). Failure leaves the typed input intact and shows
  a fallback message — user input survives, per the quality bar.

### 4. ask-mobile-composer (de32c2a / abb7f68)

- **Layout-only and token-disciplined.** Mobile: `.ask__composer` is the fixed positioning context;
  `.ask__composer-input` full-width; mic absolutely anchored top-right, Send bottom-right; the field
  reserves `calc(var(--hit-target) + var(--space-2))` right/bottom padding so text never runs under
  either control. `bp-tablet+` resets to the original inline flex row. Every value is a token
  (`--space-*`, `--hit-target`, `--color-paper`, `--color-rule`) — no raw hex/px.
- **Tap targets:** both control wrappers set `min-width`/`min-height: var(--hit-target)`; Send keeps
  its `minHeight: var(--hit-target)`. Conforms to GOAL §7's load-bearing ≥44px requirement.
- **Conforms to design/screens/ask.md region 2** (full-width input, mic top-right, Send bottom-right,
  reserved padding, inline row at tablet+). The `.tsx` change is purely wrapping the existing
  RecordButton/Button in positioned `<span>`s — no behavior change.

### 5. prompts/lesson_analysis.md (7b99e9c)

- **Over-flagging guard is present and explicit:** after listing the learner's literal self-flag cues
  ("I don't know", "no sé", "¿cómo se dice…?", etc.), the prompt adds *"Ignore the same phrases when
  they are ordinary conversational speech rather than a signal of not knowing a word (e.g. 'no sé si
  vienes', 'I don't know why')"* and instructs the model to *"map the self-flag back to the actual
  Spanish target, never the English filler itself."* This directly covers the ordinary-speech risk.
- **JSON output contract unchanged:** the edit is confined to the prose describing *when* to flag,
  inside the existing `flaggedWords` bullet; `term` / `lemma` / `partOfSpeech` sub-fields and the
  four-part output shape are untouched. Content-hash bump → `prompt_version` advances automatically,
  consistent with the versioned-prompt convention. No §3 accuracy regression; no provider specifics.

### Cross-cutting

- **§6.7 / §6.7b provider-neutrality held:** no provider-specific types, options, or prompt syntax
  leaked through the transcription seams. `ffmpegSplit.ts` deals only in bytes/duration; the generic
  `/api/transcribe` route is provider-agnostic; `transcription/types.ts` keeps the normalized shapes.
- **No analytics, no secrets, no key-to-browser, no `eval`** introduced by any of the five surfaces.
- **Append-only `review_log`** untouched; the yesno path writes through the same `submitReview` seam
  as MC, so SM-2 invariants are unchanged.
