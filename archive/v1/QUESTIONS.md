# Questions

<!--
Written by the orchestrator when it hits an escalation boundary (GOAL.md §13)
and cannot proceed without human input.

TO ANSWER:
1. Add your response under the question's "Your answer:" line.
2. Change [PENDING] to [ANSWERED].
3. Save the file. Locally that's enough; in sync mode (ORCH_SYNC=1) you can
   do both steps in the GitHub web editor and commit — the loop pulls before
   every iteration.

No restart needed. The next iteration picks the answer up — typically within
a couple of minutes (the loop slows to 5-minute checks when fully idle). The
orchestrator records the resolution in DECISIONS.md and moves the entry to
## Answered.
-->

## Pending

<!-- Orchestrator writes here when blocked. Answer these to unblock it. -->

### [PENDING] Your Anthropic account hit its monthly usage limit — raise it, or wait until July 1?

**What happened.** The KJV run got **10 of its 46 chunks done** (→ **359 hard words are already waiting for you in `/triage?source=3`**, defined and archaic-filtered — go keep/skip them any time, that part needs no AI). But partway through, the remaining 36 chunks all started failing instantly with the **same hard error from Anthropic**:

> `400 — "You have reached your specified API usage limits. You will regain access on 2026-07-01 at 00:00 UTC."`

This is **not** a bug, not the flaky network from the last few iterations, and not this app's tracked spend (the app's live DB shows only **$1.62** of LLM spend ever — far under your $25/mo line). It's a **usage cap configured on your Anthropic account/key**, and it counts *all* usage on that key — the ephemeral $7.41 KJV proof run (iter 165), 178 iterations of build-agent traffic, etc., none of which this app records. It resets on **2026-07-01** (≈17 days).

**Why it matters beyond KJV.** While the cap is in force, **every live AI feature is paused** — new word definitions, quiz/lesson generation, the Ask chatbot, suggestions, and any new ingestion. What still works fully: **Review, Triage (including the 359 KJV words), and anything served from cache** — none of those call the API.

**I've stopped relaunching the KJV run** — until the cap clears it just fails instantly, so retrying is pointless noise. It's fully resumable: the 36 failed chunks pick up exactly where they left off the moment the key works again.

**Your call:**
- **(A) Raise the cap now** in the Anthropic Console (Billing → *Usage limits* / *Spend limits* on the key in `/workspace/.env`). Tell me here when it's done and I'll resume the KJV resume next iteration and finish the remaining 36 chunks (≈$0.4 more on sonnet).
- **(B) Wait for the 2026-07-01 reset.** I'll leave KJV blocked and resume it automatically once the key works again. You can still triage the 359 words and review your decks in the meantime.
- **(C) Done at 10/46 — don't finish the rest.** Triage the 359 words you have and call KJV good enough. (You can always ask me to finish later.)

I recommend **(A)** if you want the full Bible soon and don't mind a slightly higher month, otherwise **(B)** — nothing is lost by waiting.

**Your answer:**


### [INFO — no answer required] Phase 1 review checklist (per your "make a list of everything implemented" request)

You asked for "a list of everything that's been implemented and what I need to
work through" so you don't miss checking anything. Here it is. **Nothing here
blocks me** — per your instruction I'm fixing the Phase-1 issues you flagged
and then continuing into Phase 2. Use this as your test plan when you're back;
drop reactions in FEEDBACK.md.

**What Phase 1 ships (all merged, trunk green — 347 tests):**

1. **Ingest** (`/ingest`) — drop a PDF (workbook scans, vision-extracted) or
   paste raw text; language auto-detect/select; pages classified
   (vocab / grammar / other); candidate words → triage.
2. **Triage** (`/triage?source=N`) — know / learn / skip each candidate; batch
   "Keep N"; confirm-time dedupe surfaces collisions (keep/merge).
   *(Being fixed this round: kept word should vanish, post-Keep summary screen,
   Done → go to Review.)*
3. **Library** (`/library`) — all your words; search (accent-insensitive),
   filters, manual add (auto-fills a definition), delete (history retained),
   "I forgot this", provenance on each word.
4. **Review / SRS** (`/review`) — SM-2 spaced repetition; due cards;
   multiple-choice default with flip-card fallback; three grades; "I forgot
   this" demote; cloze questions mixed in from cache.
5. **Quiz** (`/quiz`) — configurable quizzes (def-match / cloze / mixed),
   per-question feedback, cached explanations, results.
   *(Being fixed this round: instant green/red on MC, no Check-Answer click,
   no "I don't know" on MC, show the explanation on a wrong answer, default 10.)*
6. **Grammar** (`/grammar`) — AI-seeded curriculum (categories → topics),
   mastery-derived practice queue, "what your tutor is covering" from your PDFs.
7. **Lessons** (`/grammar/topics/:id/lesson`) — generated lesson (explanation →
   examples → practice), MC / fill-in / conjugation / free-text answering with
   LLM grading + "explain why" on every answer; topic mastery tracked.
8. **System** (`/system`) — LLM spend, job statuses, recent errors, DB backups
   (daily + pre-migration). *(Being added: a Preferences section for
   definition-display + new-cards-per-day.)*
9. **Docs** — `docs/README.md` (clone → run → use on your phone via LAN /
   Tailscale, "where your data lives", backup/restore), `docs/demo.md`,
   `TODO-LATER.md`.

**Known gaps / things I'd specifically check** (most are being fixed now —
see FEEDBACK.md ## Processed for the task each maps to):
- The curriculum is **seeded by a button** on `/grammar`, not automatically.
  This is why "I ingested words and /lesson still doesn't work" (see below) —
  lessons hang off grammar **topics**, and topics come from seeding the
  curriculum + grammar pages in PDFs, not from vocab words.
- Quiz answer pool currently draws only from words you've ingested, so
  definitions can feel repetitive — being widened.
- No global nav bar / home page / footer yet — coming in the design-polish pass
  you authorized.

**Your answer (optional — reactions welcome, but I'm proceeding):**


## Answered

<!-- Resolved questions are moved here by the orchestrator for record-keeping. -->

### [ANSWERED] Run the KJV (Gutenberg) ingestion against your live library? — owner: "Run it!"

**Your answer (FEEDBACK.md, 2026-06-14):** "Wow! The Mochi is in there! … Run it! I'm so happy with the outcome" — with awareness it's ~9,000 candidate words.

**Resolution (orchestrator, iteration 175):** Approved → launched the **full KJV** (Project Gutenberg ebook 10) against the **LIVE `data/app.db`**, on **sonnet** (`gutenberg_extraction` pinned to claude-sonnet-4-6 since iter 165), as a detached orchestrator data op. Took a consistent backup first (`data/backups/app-pre-kjv-2026-06-14T07-58-10Z.db`). Started 08:00:15Z: 9034 pre-pass candidate words → 46 classification batches; upfront estimate **$4.85** (err-high, under the §13 $5 line). **Crucially, this run STOPS at the triage queue** — the archaic-aware rubric's kept hard-words land in `/triage?source=3` as `pending`; **nothing enters your study deck until you keep/skip them**, so the book does not silently add thousands of cards (directly addresses your "worried it's going to add 9000"). Monitored across iterations via `logs/orchestrator/kjv-prod-ingestion.log`; actual cost + triage count reported on completion. The earlier "2-3 runs" you flagged were ephemeral dev/proof runs (never your DB) — see the FEEDBACK ## Processed disposition and DECISIONS iter 175 for the dev-vs-prod guardrail answer. Recorded in DECISIONS.md iter 175.

### [ANSWERED] Phase 3 firewall egress (gutenberg.org) + Mochi fixture — owner landed both

You asked (iter 150) for `gutenberg.org` on the firewall allowlist (blocks the Phase-3 Must,
Gutenberg/KJV ingestion) and, when convenient, 3–5 Mochi cards in `docs/fixtures/mochi/`
(gates the Phase-3 *Could*, Mochi import).

**Your answer:** "done and done. firewall edited and mochi ingest file dropped in docs.
You'll have to figure out how to read it, idk how."

**Resolution (orchestrator, iteration 152):** Both verified BY TOOL (not assumed from the
written answer — the owner historically resolves blockers by silent action). Commit 920d50d
added `gutenberg.org` to `.devcontainer/init-firewall.sh:55` **and the firewall is live** —
`curl https://www.gutenberg.org/ebooks/10.txt.utf-8` returned **HTTP 200** (redirect to
`/cache/epub/10/pg10.txt`, ebook 10 = the KJV itself), so egress works end-to-end, not just
script-edited. The Mochi fixture `docs/fixtures/mochi/Vocab.mochi` (48 KB) is present; I
"figured out how to read it" — it is a **ZIP containing a single `data.json` (326 KB) in
Cognitect Transit-JSON** (`~:`/`~#`/`~t` tags; each card has `content` "front---back",
`name`, `pos`, `reviews[]` SRS history, `tags`). **Phase 3 is unblocked.** Acted this
iteration: decomposed Phase 3 (schema-gate-005 → gutenberg-kjv-ingestion →
english-placement-assessment → mochi-import), opened the schema gate for a per-source
`language` column (the triage→deck path is hardcoded Spanish, so English words can't route
to the English deck), and spawned **schema-gate-005** alone (the gate runs one model change
at a time). The Gutenberg/KJV ingestion forks from the migrated base next iteration. Mochi
format is captured for the importer (a Could, after Gutenberg + calibration). Recorded in
DECISIONS.md iter 152.

### [ANSWERED] Disable /ingest on mobile — owner chose A (override the GOAL §15 phone-ingest sub-criterion)

You asked (FEEDBACK, 2026-06-12) to disable the `/ingest` route + its entry points on
mobile. I flagged that it contradicts GOAL §15 ("every Phase-1 Must story passes on a
real phone browser"; PDF ingestion is a Must) and offered: (A) make /ingest desktop-only
and treat the §15 phone-ingest sub-criterion as waived; (B) de-emphasize only; (C) leave
as-is.

**Your answer:** "A. Ingest is a desktop item. I will not be doing it on phone. If it
contradicts the item in GOALS then that's fine. override it"

**Resolution (orchestrator, iteration 149):** Option A. GOAL.md is read-only and the owner
explicitly authorized overriding the §15 phone-ingest sub-criterion, so that sub-criterion
is **waived** (recorded in DECISIONS.md iter 149; GOAL.md itself untouched). Acted: amended
`design/screens/ingest.md` (+ INDEX Change-log) to make Ingest desktop-only — below the
640px breakpoint the route renders a plain "Ingest is desktop-only" notice and every phone
entry point (Home Ingest card + buttons, Review empty-state Ingest button) is hidden;
detection by viewport width (matchMedia), never user-agent. Spawned **ingest-mobile-guard**
this iteration. Everything else (review, triage, quiz, grammar, library) stays phone-primary
and still must pass on a phone.

### [ANSWERED] ffmpeg in the container — to transcribe full-length (~1 hr) lesson recordings (Phase-2 done gate)

Phase 2 transcribes lesson audio via Whisper (≤24 MB/request); a real ~1 hr lesson
exceeds that at any bitrate, so it must be split→transcribed→stitched, and
frame-aware splitting of compressed audio (m4a/mp3) needs **ffmpeg** (a system
binary the orchestrator can't provision — apt is firewalled, devcontainer is
human-owned, same class as the `api.openai.com` firewall change). GOAL §16/§17
pre-approve ffmpeg as free OSS.

**Your answer:** "I have added ffmpeg and the audio into lesson audio. Plug away sir"
(+ the real 26 MB lesson fixture dropped into `docs/fixtures/lesson-audio/`).

**Resolution (orchestrator, iteration 146):** Fully unblocked. The owner added
`ffmpeg` to `.devcontainer/Dockerfile` (commit 466614a, iter 139) and — the step
that was outstanding through iters 139–145 — **rebuilt the container**: verified
this pass that `ffmpeg`/`ffprobe` 5.1.9 are live in `/usr/bin/` (`command -v`),
the worker worktrees were wiped (the 2 ORPHANs report "no worktree — container
rebuilt?"), and trunk is green on base after the rebuild (596 passed). The owner
removed the iter-145 `STOP` file and re-ran the loop = resume signal. Acted:
spawned `lesson-audio-oversized-splitting` (opus/high) to build the real
ffmpeg `SplitAudio`; the real-recording validation run follows once it integrates
(the 26 MB fixture needs the merged split path). Recorded in DECISIONS.md iter 146.

### [ANSWERED] Transcription provider: firewall host + API key (Phase 2 live use)

Phase 2's transcription layer needs the second paid dependency (GOAL §6.7b —
Whisper-class API, default OpenAI Whisper) reachable: `api.openai.com` added
to the firewall allowlist + `OPENAI_API_KEY` in `/workspace/.env`. Both were
human-only actions (orchestrator never edits the firewall).

**Your answer:** Done!

**Resolution (orchestrator, iteration 89):** Verified both — `api.openai.com`
is on the allowlist (commit `8c0838e`) and `OPENAI_API_KEY` is present in
`/workspace/.env`. The container was rebuilt to apply the firewall change
(which is why all worker worktrees showed ORPHAN this iteration). Live
transcription is unblocked; the OpenAI Whisper adapter target is settled.
Recorded in DECISIONS.md.

### [ANSWERED] What is /lesson doing right now? I ingested words and it still doesn't work

> what is /lesson doing right now? Is this is a later phase? I have ingested words and it still doesnt work

**Orchestrator answer:** Not a later phase — lessons shipped (grammar-lessons-quizzes,
merged this run). The reason ingesting **vocabulary words** didn't make `/lesson`
work: lessons are generated per **grammar topic**, and grammar topics come from
**seeding the curriculum** (a button on `/grammar` today) plus grammar pages
detected in PDFs — not from the vocab words you triage. So the path is:
open `/grammar` → "Seed curriculum" → pick a topic → it generates the lesson.
This is also a UX gap I'm closing: the curriculum-seeded-on-first-run vs.
manual-button question (review-03 nit #6) and a clearer empty state, plus the
home/nav work, will make this discoverable instead of a dead end. Flagged in the
Phase-1 review checklist above.

### [ANSWERED] UI visual polish — when and how (human-initiated discussion)

> The code is great and I'm excited to test it. The thing I'm wondering is that when we're done with phase one here Is the UI gonna get an update to make it look a little more professional and polished? Because it does right now kind of just look like a V0 project, which is fine, but I would like to share this with some people, and I don't think it's at that position yet. So, are you aware of that? Are you happy with the design right now and the look of the UI? Do you want to tackle that when we've done phase three? Do you want to tackle it now? I'm curious your answer. But don't begin to make any design tasks until we've both figured this out and discussed it.

**Orchestrator answer (summary):** Gap is real and lives in design/ (tokens.md + components.md), not scattered through code — reviews audited token *conformance*, not aesthetic ambition. Recommended the polish pass at the Phase-1 boundary (upgrade tokens + components → screens inherit → per-screen sweeps), before Phase 2 builds more screens on the V0 look. [Full text in git history.]

**Your answer:**
I like the identity! It's just missing the polish that most sites have like a home page, nav bar, maybe a simple footer. I like https://www.merriam-webster.com/. I'll add that to your egress list. It's a bit too cartoonish and childlike but its a good base, too. Don't change the identity based on merriam webster. To do the design work, imagine you are a designer at apple and want to make this app polished to handoff to your boss.  Take another shot at it.

**Resolution (orchestrator, iteration 55):** Design polish authorized; freeze lifted. Identity (D0/D1) stays. Adding a home/landing page, header nav bar, and simple footer; elevating tokens + components to an Apple-handoff bar; merriam-webster.com used as a *structural* reference only (not its identity — noted too cartoonish). Sequenced after the in-flight Phase-1 bug fixes (same screens/components), then: contract amendment → polish foundation → home/nav/footer → per-screen sweeps. Recorded in DECISIONS.md.

### [ANSWERED] Runtime Anthropic API key for the app's LLM calls

The app's own LLM layer (PDF vision extraction, definitions, quiz generation, …) needs an `ANTHROPIC_API_KEY` at runtime — separate from the worker OAuth token, which only authenticates the build agents. There is no `.env` in the repo yet. Without it, the PDF ingestion pipeline can be built and tested against a mocked provider, but the GOAL.md §15 requirement "validated against the real scans in /docs/fixtures/workbook/" cannot be exercised end-to-end.

Please create `/workspace/.env` (it is git-ignored) containing:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Nothing is blocked in the meantime — pipeline construction proceeds with mocked-provider tests; live validation is queued as its own backlog task.

**Your answer:**
I put it there for you. Build away! You're doing great work i can't wait to see it

### [ANSWERED] Worker auth broken — no API credentials in the container

Every worker spawn failed with `authentication_failed` ("Not logged in", `apiKeySource: none`): no `ANTHROPIC_API_KEY` in the environment, no credentials file, and child `claude -p` processes inherit nothing from the orchestrator session.

**Your answer:** Resolved by action rather than text: commit ac95f66 ("Load credentials from container env file for worker agents") makes `bin/spawn` source `.devcontainer/devcontainer.env` (which provides `CLAUDE_CODE_OAUTH_TOKEN`) inside each worker script. Orchestrator verified on 2026-06-10: `claude -p` with that env file loaded authenticates and responds. Worker spawning is unblocked.
