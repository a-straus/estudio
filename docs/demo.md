# Estudio — 5-minute demo

A click-by-click walkthrough of the full Phase-1 loop: ingest → triage → review
→ quiz (with a deliberate miss) → grammar lesson → "explain why".

## Before you start

- The app is built and running in production mode, reachable at
  **http://localhost:3000** (see [README](./README.md) → _Setup & run_).
- **`ANTHROPIC_API_KEY` is set in `.env`.** Several steps depend on LLM jobs
  completing — PDF word extraction, quiz generation, lesson generation, and
  the cached "explain why" text. Without the key those jobs fail and the screens
  show an error state instead of content. Steps that need the key (and a
  finished job) are flagged **[needs LLM]** below.
- Sample workbook PDFs live in `docs/fixtures/workbook/`:
  - `Paragraph to Find words in.pdf` — good for the vocabulary path.
  - `Grammar worksheet to process.pdf`.
- Total time ≈ 5 minutes, most of which is waiting for two LLM jobs.

---

## 1. Ingest a workbook PDF — ~60s **[needs LLM]**

1. Open **http://localhost:3000/ingest**.
2. The method selector defaults to **Upload PDF**. Leave it there.
3. Click the file field ("Choose a PDF scan") and pick
   `docs/fixtures/workbook/Paragraph to Find words in.pdf`.
4. The upload starts; the button shows **Reading…**, then a job-status line
   appears (**Queued…** → working → done).
5. When the ingestion job finishes, a **Triage** link appears
   (`/triage?source=<id>`). Click it.

> What's happening: the PDF original is saved under `<DATA_DIR>/uploads/`, a
> `source` row + per-page rows are created, and a background job extracts
> candidate words page by page using the LLM. The Triage link is the job's
> `sourceId`.

---

## 2. Triage the extracted words — ~45s

You're now on **/triage?source=&lt;id&gt;**, looking at a batch of extracted
candidate words.

1. For each word, decide with the per-row buttons:
   - **Learn** — keep it; it enters your library and SRS schedule.
   - **Know** — you already know it; it's set aside.
   - (Bulk shortcuts **Learn all** / **Know all** are at the top; on desktop you
     can also use the arrow keys to move and Enter to advance.)
2. Mark several words **Learn** (you want some kept words for the next steps).
3. When every word in the batch has a decision, the **Keep N words** button
   activates. Click it to confirm the batch.
4. Click **Next batch** (or **Done** if it was the last batch).

> Triage is thumb-drivable on a phone (full-width Learn/Know) and
> keyboard-drivable on desktop.

---

## 3. Review the kept words — ~30s

The kept ("Learn") words are now in your library and due for review.

1. Open **http://localhost:3000/library**.
2. You should see the words you kept. Click one to open its detail panel.
3. In the detail panel, click **I forgot this** (also available as the row
   action of the same name).
4. A toast confirms it: that card is demoted by the SM-2 scheduler and pulled
   **due now**, so it will resurface immediately in review.
5. Open **http://localhost:3000/review** (studies the Spanish deck's due queue
   by default). Grade a card or two — multiple-choice cards offer the options;
   recall cards reveal the answer and you self-grade.

> The "I forgot this" demotion is the heart of the SRS: it resets the card's
> interval so you see it again soon. (Restoring a card to neutral is also
> possible from the library.)

---

## 4. Take a quiz and deliberately miss one — ~60s **[needs LLM]**

1. Open **http://localhost:3000/quiz**.
2. On the setup screen, pick **Deck: Spanish**, a short **Length**, and a
   **Style** (Multiple choice is simplest to demo). Start the quiz.
3. The button shows **Writing questions…** while the LLM generates the quiz, then
   the first question appears.
4. **Deliberately choose a wrong answer.** The card shows **Not quite.** and
   marks the correct option.
5. Click **Explain why** on the result — the cached explanation for that
   question appears (served from cache, so it's instant on repeat).
6. Finish the quiz with **Next** → **See results**.

> Two things just happened server-side: the miss wrote an SRS failure
> (`recordQuizMiss`) that pulls the missed word **due now** — boosting it back
> into your review queue — and the explanation was cached so re-opening it never
> re-bills the LLM.

---

## 5. Open a grammar lesson — ~45s **[needs LLM]**

1. Open **http://localhost:3000/grammar**.
2. If the curriculum hasn't been seeded yet, start the seed job — the screen
   shows **Building your grammar curriculum… ~30s**. Wait for the topic list to
   appear.
3. Click a topic to open its lesson (`/grammar/topics/<id>/lesson`). On first
   open the lesson is generated — the screen shows **Writing the lesson… ~40s**.
4. Read through the lesson: **explanation → examples → quiz**.
5. In the lesson quiz, answer a question. The **Explain why** reveal appears
   after you answer, showing the cached rationale.
6. Use **Next** to move through the questions to **See results**.

---

## 6. (Optional) Check the System screen — ~15s

Open **http://localhost:3000/system** to see the running totals the demo just
generated:

- **SPEND** — LLM cost + call count (per task).
- **JOBS** — recent background jobs (ingestion, quizGen, lessonGen, backups).
- **ERRORS** — any persisted errors.
- **BACKUP** — last backup; **Export backup now** triggers one on demand.

---

## If a step shows an error instead of content

- **Extraction / quiz / lesson never finishes or errors:** confirm
  `ANTHROPIC_API_KEY` is set in `.env` and the server was restarted after
  setting it. Jobs retry with backoff and persist their error state; the System
  screen's ERRORS section shows the reason.
- **Triage is empty ("Nothing to sort"):** the ingestion job hasn't finished, or
  the PDF yielded no candidate words — re-check the Ingest job status.
- **Review is empty ("Nothing due"):** keep some words as **Learn** in triage
  first, or use **I forgot this** in the library to pull a card due now.
</content>
