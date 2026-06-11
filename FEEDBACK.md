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
- there should be a real progress bar on reading the pdf pages. A user will want to know that it's working. Also progress bar on the curriculum building
- after clicking 'learn' on a word in http://localhost:3000/triage?source=1 it should disappear. It also looked like there was a bug where the second word to learn was skipped. I'm not sure though
- the screen after you click 'keep x wrods' on triage is horrible. It just shows "Kept 29 words · 1 known archived · 0 skipped." That's not helpful at all. Theres a button that says done too. When you click done it should take you to learn or something, not just a page with nothing. http://localhost:3000/triage?source=1 is not a proper redirect
- We definitely need a header nav bar
- For /library, on mobile view, in the select rectanges/tables, you are missing the horizontal bar that separates "all/learning" etc. The two top and two bottom options have no deliniation
- When you get an answer wrong in a quiz (in my instance im on grammar/topics/4/lesson) it hasn't generated the 'wrong reason' yet and so i have to sit there waiting for it. We should probably use a smaller, faster model for this, or maybe stream it in. If we're using fable for this, then that's overkill. sonnet should be fine with low thinking
- I'd like a notes section on answers, correct or incorrect. for instance, i got this piece: (Why is 'Llegué tarde porque perdí el autobús que ya salió' awkward in careful Spanish?) on /grammar/topics/4/lesson and I want to write a note to myself to remember this. THe app can then use my notes to add context to generate quizzes in the future.
- On a free response question, the app responded with an "answer" that was completely unrelated to what I wrote. In the case of free response answers we should take into account what the user said. It does that properly after the answer, but maybe if the user is 'close' to an answer we can figure out what the correct way to say what they wanted really was.
- on /quiz multiple choice it should just be right or wrong (green or red) when i click the selection. we don't need to click 'check answer.' Also, on multiple choice questions, there shoudl not be an option for 'i dont know.' If you dont know you would just select one and move on
- Im noticing on /quiz that the possible answers are limited to what the app has already ingested. its probably better to make it so that we have a bank when we generate the quiz. that way we won't see similar definitions all the time (a few are ok)
- It seems the time between clicking 'check answer' and the color going green or red is too long. what's happening there? it should be near instantaneous.
- the / url point needs to not open to what it does. it needs to be more navigable so i can know what to check
- IN the future When we have a checkpoint that i need to review, i need a list of everything that's been implemented and what i need to work through. im worried i didn't check everything
- If this piece of feedback is still here,, i want you to continue into phase 2 because i'm going to step away from the computer for a bit. This means that you should fix the issues that i have pointed out in phase one, make a list of things to review from phase one, and then once you have put those questions in the QUESTIONS.md then continue on to phase 2 as much as you can.

## Processed

<!-- Moved here by the orchestrator with what it did about each. -->

- 2026-06-11 — "When you're done with Phase 1, stop and let me review" → Phase-1 review gate recorded in TASKS.md and DECISIONS.md: once the Phase-1 Musts (grammar-lessons-quizzes, review-03, docs-and-demo) are done and trunk is green, the orchestrator posts a [PENDING] "Phase 1 ready for your review" entry in QUESTIONS.md and spawns no Phase-2 work until you answer. (iteration 51)

- 2026-06-10 — Vision-path PDF extraction, default scan-reading model `claude-fable-5` → folded into ARCHITECTURE.md (LLM-layer conventions: per-task model config; `pdf_extraction` task defaults to `claude-fable-5`) and recorded in DECISIONS.md. Validation against `docs/fixtures/workbook/` will be an acceptance criterion on the Phase 1 PDF-ingestion task when the backlog is decomposed (iteration 2 of the first-iterations protocol).
