# Feedback

<!--
Your inbox to the orchestrator — the steering channel for everything that
does not change what the product IS (that's GOAL.md, which only you edit).

Add items under ## Inbox any time — while it runs or between runs. Bugs,
tweaks, "make this better", feature asks within scope. Locally: edit and
save. Remote (ORCH_SYNC=1): edit on GitHub and commit.

Every iteration the orchestrator empties the inbox: each item becomes
prioritized backlog tasks (or a schema-gate cycle if it touches the data
model), then moves to ## Processed with a disposition note. Items that
would cross a GOAL.md §3 non-goal are escalated to QUESTIONS.md instead of
silently acted on or ignored. The loop will not declare Release done while
the inbox is non-empty.

Altitude guide:
  "the conjugation drill should shuffle answers"     → here
  "add a listening-comprehension mode"               → here (becomes an epic)
  "the product should also teach French"             → GOAL.md (changes the goal)
-->

## Inbox

<!-- - one item per dash; date them if you like -->

- [Feature - Review UI]: Add a configuration setting per deck/session to toggle between standard multiple-choice format and a binary "Yes/No" (Mochi-style "Do you know it?") review card format. See /docs/mochi-ui-screens
- [Feature - Global Navigation]: Add a persistent "+" button to the bottom navigation bar on mobile and desktop that opens a modal to quickly add a word or phrase from anywhere in the app.
- [Feature - Audio Ingestion]: Integrate a speech-to-text microphone button within the new "Add Word/Phrase" modal to allow users to dictate text input instead of typing.
- [Performance - LLM Optimization]: Downsize the primary LLM to a faster, smaller model (e.g., swapping a "Pro" model for a "Flash" or "Turbo" model) and implement text-streaming for all suggestion generations to eliminate perceived latency.
- [UX - Review Flow]: Remove the "Check Answer" button on multiple-choice questions so that the correct/incorrect state displays immediately upon option selection.
- [UI - Bottom Nav]: Increase the height of the mobile bottom navigation bar and add distinct visual dividers or contrasting background shading between the navigation options to improve tap targets.
- [Guardrail - Mobile Access]: Restrict and disable the /ingest route and its entry points entirely when the application is accessed from a mobile device.
- [UX - Navigation Flow]: Optimize the "Start Review" action on the home page to immediately launch the review session, completely bypassing the redundant intermediary confirmation page.
- [UI - Ask Page]: Redesign the mobile /ask interface so the text input box spans the full width of the screen bottom, containing a clickable microphone icon in its top-right corner and a send button in its bottom-right corner.
- [Feature - Data Management]: Add an immediate, single-click delete action for individual entries within the history list on the /ask page without prompting for confirmation.
- [Architecture - Refactor Scope]: Conduct a technical scoping assessment to convert the current multi-page application into a Single Page Application (SPA) architecture to eliminate full-page refreshes when navigating via the bottom nav bar.
## Processed

- 2026-06-12 (iteration 139) — "cannot view the website to review it … `npm run build && NODE_ENV=production npm start` used to serve localhost:3000, now I get nothing" → **investigated; the committed code's production build + serve work end-to-end at HEAD (466614a) — this is NOT a code defect.** Evidence gathered this iteration by tool: a clean `rm -rf */dist && npm run build` exits **0** and emits `web/dist/index.html` + assets + `server/dist`; booting `NODE_ENV=production node server/dist/index.js` and probing it returned **200 for `/` (real index.html), 200 for `/api/health` (`{"status":"ok"}`), and 200 for the JS bundle** — the page loads correctly. So the serve path is fine; "nothing" is environmental. Prime suspect: the **`&&` chain** — if `npm run build` prints *any* error, `npm start` never runs (so :3000 has nothing), and a recent devcontainer rebuild (the ffmpeg one) commonly leaves `node_modules` / the native `better-sqlite3` binding needing reinstall, which makes the build (or boot) fail silently behind the `&&`. **What to do:** run the two halves separately — (1) `npm install` at the repo root (re-link deps after a rebuild), (2) `npm run build` **alone** and confirm it ends without error + prints the vite `dist/…` summary, then (3) `NODE_ENV=production npm start`, which should log `server listening … port 3000`. If the build is clean but :3000 is still blank: check nothing else holds the port (`lsof -i :3000`) and that you're opening it from the same machine the server runs on (if it's the always-on box, use the LAN/Tailscale address from `docs/README.md`, not `localhost`). If it persists, paste the `npm run build` output + the startup log and I'll pinpoint it. **Also queued a small robustness fix → `prod-serve-web-guard`** (spawned this iteration): make the production server self-diagnosing — log the openable `http://localhost:PORT` on boot, and if the web build is missing return a clear "run `npm run build`" message + a boot warning instead of a blank/opaque page (GOAL §6.9/§12: errors surfaced, never swallowed). [investigated + answered + 1 task]

<!-- Moved here by the orchestrator with what it did about each. -->

- 2026-06-12 (iteration 89) — "we need a hamburger menu or something to nav on mobile" + "navbar disappears on /review" → **mobile-nav-and-review-landing** task [Must]. Root cause found: the design contract (shell.md) already specifies a phone **bottom-bar nav (AppNav)**, and `SiteHeader.css` deliberately hides the header's nav links below 640px expecting AppNav to own phone nav — but **AppNav was never built** (home-nav-footer shipped SiteHeader/SiteFooter only), so phone currently has *zero* navigation. Task builds AppNav per shell.md (the contract's answer to "nav on mobile" is a thumb-zone bottom bar, not a hamburger). The /review complaint is the same nav-loss made acute by Review being a deliberate session takeover: refinement = the active card-answering run stays a focused takeover, but /review's pre-session landing + empty/finished states show standard chrome (header + AppNav + footer), aligning Review with the existing Quiz config→play pattern. shell.md amended + INDEX change-log this iteration. WAIT for schema-gate-003 to integrate (gate runs alone); no schema grant. [Must]
- 2026-06-12 (iteration 89) — "the 'i forgot' button that pops up is on top of the LEARNING text on /library; it should be horizontally on the side" → **library-forgot-button-layout** task [Should — trivial CSS]. The "I forgot this" control overlaps the "LEARNING" status text in the Library word row/detail; lay them out horizontally (button beside the status, no overlap) using existing tokens. File-disjoint from the nav task (Library screen only), so the two parallelize once the gate lifts. WAIT for schema-gate-003 to integrate; no schema grant. [Should]

- 2026-06-11 (iteration 55) — **MASTER DIRECTIVE** "if this is still here, continue into phase 2 … fix the issues … make a list of things to review … then continue phase 2 as much as you can" → Acted on: this supersedes the Phase-1 freeze gate (DECISIONS.md). The 12 issue items below are converted to a prioritized Phase-1-fix backlog (ahead of Phase 2); a Phase-1 review checklist is posted in QUESTIONS.md ("[INFO] Phase 1 review checklist"); Phase 2 spawning is unblocked and resumes once the flagged fixes are in flight / capacity frees.
- 2026-06-11 — "real progress bar on PDF page reading + curriculum building" → **ingestion-progress-and-topic-link** task (per-page / per-topic progress reported by the jobs and rendered on Ingest + Grammar; also fixes review-03 nit#3 90%-stall). [Should]
- 2026-06-11 — "after 'learn' the word should disappear; possible second-word-skipped bug; horrible post-Keep screen; Done should go to Review; /triage?source=1 isn't a proper redirect" → **triage-fixes** task (spawned this iteration). [Must]
- 2026-06-11 — "we need a header nav bar" + "the / url should be navigable, not open to what it does" → folded into the authorized **design polish**: a home/landing overview + global **home-nav-footer** task. [Must — after fixes land]
- 2026-06-11 — "/library mobile: missing the horizontal divider between all/learning in the 2×2 select control" → **library-mobile-separator** task (SegmentedControl row divider on mobile wrap). [Should — trivial]
- 2026-06-11 — "wrong-reason takes too long to generate; use a smaller/faster model — sonnet low thinking, fable is overkill" → **lesson-grading-fixes** (spawned): quiz_grading LLM task → sonnet at low effort; consider streaming/pre-generation. [Must]
- 2026-06-11 — "notes section on answers (correct or incorrect) that the app later uses as context when generating quizzes" → **notes-on-answers** NEW FEATURE; needs a `note` table → routed through the schema gate. [Should — Phase-1 polish, schema-gated]
- 2026-06-11 — "free-response grading sometimes returns an answer unrelated to what I wrote; should consider what the user said; if I'm 'close', figure out the correct way to say what I meant" → **lesson-grading-fixes** (spawned): grading prompt must ground on the user's actual answer + add a "close → here's how you'd say it" rephrase (ties to review-03 S7 Partly-right tier). [Must]
- 2026-06-11 — "/quiz MC should color green/red instantly on click (no Check-Answer button); remove the 'I don't know' option on MC" → **quiz-ux-fixes** (spawned). [Must]
- 2026-06-11 — "/quiz answer pool is limited to ingested content; build a wider bank at generation time so definitions aren't repetitive" → **quiz-caching-and-bank** task (ties to review-03 S1 cache-reuse + nit#10 distractor quality). [Must]
- 2026-06-11 — "lag between 'check answer' and the color is too long; should be instantaneous" → **quiz-ux-fixes** (spawned): MC correctness decided client-side and colored immediately; persistence happens async. [Must]
- 2026-06-11 — "I need a list of everything implemented + what to work through at a checkpoint" → satisfied now by the **Phase-1 review checklist** in QUESTIONS.md; will be regenerated at each future checkpoint. [done this iteration]

- 2026-06-11 — "When you're done with Phase 1, stop and let me review" → Phase-1 review gate recorded in TASKS.md and DECISIONS.md: once the Phase-1 Musts (grammar-lessons-quizzes, review-03, docs-and-demo) are done and trunk is green, the orchestrator posts a [PENDING] "Phase 1 ready for your review" entry in QUESTIONS.md and spawns no Phase-2 work until you answer. (iteration 51)

- 2026-06-10 — Vision-path PDF extraction, default scan-reading model `claude-fable-5` → folded into ARCHITECTURE.md (LLM-layer conventions: per-task model config; `pdf_extraction` task defaults to `claude-fable-5`) and recorded in DECISIONS.md. Validation against `docs/fixtures/workbook/` will be an acceptance criterion on the Phase 1 PDF-ingestion task when the backlog is decomposed (iteration 2 of the first-iterations protocol).
