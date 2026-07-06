# Feedback — V2

<!-- Human: append requests under ## Inbox. Orchestrator: convert each item
to backlog tasks and move it to ## Processed with a disposition. V1 feedback
is archived at archive/v1/FEEDBACK.md.

Owner note (2026-07-06): the owner's V2 bug/suggestion list lands here and is
Phase 1 (polish) priority per GOAL.md §5. -->

## Inbox

### Owner review list, 2026-07-06 (Phase-1 polish priority unless noted)

**Bugs**

1. **[BUG] /grammar/topics/{i}/lesson — MC options dead.** Selecting a multiple-choice option in a grammar lesson does nothing. Should use the same answer/grade/feedback logic as /quiz.
2. **[BUG] /library — pagination unusable.** Owner cannot navigate past the first page of words. NOTE: a `library-pagination` fix merged to main at V1 iter 177 (`web/src/components/Pagination.tsx`) — first verify whether the owner is running a pre-fix build; if the fix is live and still broken, it's a real regression.
3. **[BUG] /quiz on mobile — bottom nav cut by a stray line** after generating quiz questions and navigating to /quiz.
4. **[BUG] Grammar lesson on mobile — bottom nav bar disrupted:** stray lines/color appear above the nav bar's top delineation line.
5. **[BUG] /grammar — light/dark toggle hidden** behind the mobile bottom nav bar.
6. **[BUG-ish] /ask — phantom threads.** A thread is created/persisted even when the owner never sends a message (with or without typed text). Don't create or store a thread until the first message is actually sent; the /threads view is currently polluted with empty "asks."

**Verification**

7. **Prove lesson-recording ingestion works now.** Owner has real recordings ready to upload. Re-verify the /lessons upload → transcription → mining pipeline end-to-end on the current build (it passed its V1 §14 proof, but confirm nothing has rotted) and report readiness.
8. **Quiz generation must be batched.** Check whether quiz questions are generated serially; they should be generated concurrently (Promise.all or equivalent) — there is no reason to build them in series.

**Admin / data**

9. **Owner needs a "nuke deck" capability.** As admin, the owner wants to wipe all English words (and potentially Spanish) including their SRS/card/review data, because Mochi reviews happened outside the app during development and the in-app English state is stale. DESTRUCTIVE: this crosses GOAL §13 (delete outside normal CRUD) — design it as an owner-only System-page action with a timestamped backup taken immediately before and an explicit type-to-confirm; the actual wipe of live data is owner-triggered, never automatic.

**Navigation & shell redesign**

10. **Desktop top nav redesign.** Make the bar bigger. Home button top-left and distinctly bigger (always-available "return home"). Remaining nav selections right-aligned, with the currently-selected one emphasized (center of the group, larger). Kill redundancy: e.g. on /lessons today the word "Lessons" appears selected in the top nav, again in a left list, and again bolded in the content — one clear current-location indicator is enough.
11. **Retire the secondary/utility bar entirely (desktop AND mobile).** Ingest, Progress, Notes, and the light/dark toggle should live ONLY inside the /system page. Remove the bottom utility bar on desktop completely; on mobile likewise — System becomes the single home for those entries.
12. **Mobile bottom nav tweaks:** add a delineation line between Grammar and Add; remove the Add button from the top bar; the top-bar "Ask" becomes a proper small button instead of bare blue text.
13. **Pre-login homepage (ties to Phase-2 auth, but design/build the screen now).** Reuse the notecard view: the card shows the word "Estudio" with a punchy definition line (e.g. "the new language learning app" — copywriter's call), and the "Start review" button becomes "Login." No top nav, no bottom bar on this screen.

**Screen polish**

14. **Mobile homepage — starting card too tall.** Trim lines on mobile; first candidate to drop is the italicized example-usage line.
15. **/review start screen — "X words due today" is too plain.** Bigger, and a different (more characterful) font treatment; this is a daily-touch moment and it should feel like it.
16. **/review session on mobile — kill the scroll.** After answering MC, the screen is too tall to see the explanation. On answer: vertically collapse the word box and the four choices so only the quizzed word/phrase + the chosen answer remain (if wrong: show chosen + correct, hide the other two). Overall goal: the whole answer+explanation state fits one phone screen, no scrolling.
17. **/review — remove "choose the definition"** from the word box; it's self-evident and redundant.
18. **/quiz setup — label the choice groups.** Small headers over each selection box: "Choose language," "Choose number of questions," etc. Also define "cloze" somewhere in the UI (tooltip/caption) — users won't know the term.
19. **Grammar lesson on mobile — kill the scroll / focus mode.** Inside a lesson there is no reason to show the Ingest/Progress/Notes/System options; hide them (user exits the lesson to get them back) and generally reduce vertical chrome so lessons don't scroll.
20. **/ask on mobile — remove the redundant "Ask a question" header;** the input's placeholder ("Ask a question…") already says it. The bottom composer area is ugly overall — clean it up.
21. **/threads — too much vertical padding** between the top bar and the thread list.

## Processed
