> D5 — interaction choreography, keyboard map, thumb-zone rules, bilingual typography rules, and the final microcopy strings.

## D5 — Interaction & microcopy guide

### Answer-feedback choreography

1. **t=0** — user commits (taps "Check answer" / presses Enter / taps second-tap on selected option).
2. **t=0–120ms** (`--motion-fast`, `--motion-ease`) — chosen option transitions to `correct` or `incorrect` fill; if wrong, the correct option simultaneously transitions to `correct`; remaining options to `disabled`. Color + the words "Correct" / "Your answer" — never color alone.
3. **t=120ms** — action region swaps in place (no layout shift): verdict line ("Correct." / "Not quite.") `--font-app` `--text-base` `--weight-medium` in the verdict color; quiet Button "Explain why"; primary Button "Next" (focused, Enter-ready).
4. **No sounds, no haptics, no confetti, nothing moves after 120ms.** Wrong answers get identical motion to right ones — the verdict is information, not punishment.
5. **Advance** — on "Next": current card fades out, next fades in, `--motion-base` total. Under `prefers-reduced-motion`: all of the above instant.
6. Flip-mode: tap card or Space to flip (cross-fade); self-grade buttons appear with the back.

### Keyboard map (desktop, ≥ bp-desktop)

| Context     | Key               | Action                                |
| ----------- | ----------------- | ------------------------------------- |
| Review/Quiz | `1`–`4`           | Select option                         |
|             | `Enter`           | Check answer; then advance            |
|             | `Space`           | Flip card (flip mode)                 |
|             | `D`               | Don't know                            |
|             | `E`               | Explain why                           |
|             | `Esc`             | End session (progress saved)          |
| Triage      | `K` / `L` / `S`   | Know / Learn / Skip current           |
|             | `U`               | Undo last decision                    |
|             | `↑`/`↓`           | Move current row without deciding     |
|             | `Enter`           | Confirm batch (when complete)         |
| Library     | `/`               | Focus search                          |
|             | `↑`/`↓` + `Enter` | Navigate list / open detail           |
|             | `N`               | Add word                              |
| Quiz setup  | `Tab`/arrows      | Move between segments                 |
| Global      | `?`               | Show this key map (dismissable sheet) |

Key hints render in `--font-meta` `--text-xs` `--color-ink-faint` beside their controls at `bp-desktop`+ only.

### Thumb-zone rules (mobile)

- The bottom 30% of the viewport owns every required action: check/next, triage decisions, self-grade, session primary Buttons.
- Reading content may scroll under the action region; the action region is `position: fixed`, background `--color-paper`, top hairline `--color-rule`.
- Destructive or rare actions (delete, cancel job) are placed **outside** the thumb zone deliberately (top of detail views).
- AppNav and action regions never coexist in a session — sessions take over the full viewport.

### Bilingual typography rules (Principle 2, operationalized)

| Text                                          | Family         | Style                        | Token notes                     |
| --------------------------------------------- | -------------- | ---------------------------- | ------------------------------- |
| Headword/term (any language)                  | `--font-study` | bold, roman                  | the only bold serif in the app  |
| Example sentence, quotation, cloze stem       | `--font-study` | italic (roman for the blank) | hanging indent `--indent-entry` |
| Spanish inside lesson prose                   | `--font-study` | italic, own line             | never inline-mixed with sans    |
| Definition/gloss                              | `--font-app`   | regular                      | the app's voice                 |
| UI, buttons, labels, lesson explanation prose | `--font-app`   | regular/medium               |                                 |
| Tags, counts, jobs, costs, key hints          | `--font-meta`  | uppercase where label-like   | `--tracking-meta`               |

Rule of thumb for agents: **if the user is supposed to _learn from_ the string, it's `--font-study`; if the app is _saying_ the string, it's `--font-app`; if the machine is _reporting_ the string, it's `--font-meta`.** Language is marked by role and the tagline (`ES ·`/`EN ·`), never by color or flags.

### Microcopy table (final strings)

| Context                   | String                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Today, due                | "23 due today" / "Nothing due."                                                                                        |
| Today, primary            | "Start review"                                                                                                         |
| Today, nudge              | "Moby-Dick · 31 words waiting" → "Continue triage"                                                                     |
| Today, empty invitation   | "Ingest something new?"                                                                                                |
| Review, prompts           | "Choose the definition." / "Choose the word." / "Complete the sentence."                                               |
| Review, pre-answer        | "Check answer" / "Don't know"                                                                                          |
| Review, verdicts          | "Correct." / "Not quite."                                                                                              |
| Review, post-answer       | "Explain why" / "Next"                                                                                                 |
| Review, summary           | "20 cards · 17 correct" · "Review the 3 missed again" · "Done"                                                         |
| Flip self-grade           | "Didn't know" / "Knew it" / "Easy"                                                                                     |
| Quiz, start               | "Start quiz"                                                                                                           |
| Quiz, generating          | "Writing questions… 12 of 20"                                                                                          |
| Quiz, results             | "17 of 20" · "Retake missed"                                                                                           |
| Ingest, drop zone         | "Drop a PDF scan here, or browse"                                                                                      |
| Ingest, estimate          | "Moby-Dick · 215,000 words · est. $0.84 · ~12 min" → "Extract words"                                                   |
| Ingest, background        | "This keeps running. Progress is in System."                                                                           |
| Ingest, partial failure   | "Couldn't read 3 pages (smudged scan). 412 words extracted from the rest. Continue to triage, or re-scan pages 12–14." |
| Triage, actions           | "Know" / "Learn" / "Skip" · "Undo"                                                                                     |
| Triage, confirm           | "Keep 24 words" (count always live)                                                                                    |
| Triage, tally             | "Know 9 · Learn 15 · Skip 7"                                                                                           |
| Triage, defining          | "defining…"                                                                                                            |
| Triage, groups            | "PROBABLY NEW · 18" / "YOU MAY KNOW THESE · 9"                                                                         |
| Triage, bulk              | "Learn all 18" / "Know all 9" → "Undo"                                                                                 |
| Triage, failed gloss      | "definition failed — write one in Library, or retry"                                                                   |
| Library, search           | "Search words…"                                                                                                        |
| Library, add              | "Add word" → "Save word"                                                                                               |
| Library, auto-define fail | "Couldn't auto-fill. Write the definition, or retry."                                                                  |
| Library, delete confirm   | "Delete _vergüenza_? Its card and schedule go with it." → "Delete" / "Keep"                                             |
| Library, empty            | "No words yet. Ingest something, or add one by hand."                                                                  |
| Library, forgot this      | "I forgot this" → toast "_vergüenza_ · due now"                                                                        |
| Grammar, lesson loading   | "Writing the lesson… ~40s"                                                                                             |
| Grammar, partial          | "The lesson didn't finish. Retry, or read the partial draft below."                                                    |
| Grammar, quiz CTA         | "Take the quiz"                                                                                                        |
| Free-text verdicts        | "Correct." / "Partly right." / "Not quite."                                                                            |
| Progress, stats           | "94 new · 257 learning · 61 mature" · "Last 20 sessions · 84% average"                                                 |
| System, spend             | "LLM spend · $4.12 since May 1 · $0.84 this week"                                                                      |
| System, backup            | "Last export · yesterday 23:40 · 2.1 MB" → "Export backup now"                                                         |
| System, preferences       | "Definitions on reveal · Spanish / English / Both" · "New cards per day · 10 / 20 / 40"                                |
| Generic store error       | "Couldn't load your decks. Reload, or check System for details."                                                       |
| Explain failure           | "Couldn't generate the explanation. Try again."                                                                        |

**Voice rules (apply to all new strings):** every error names what happened and the next action; nothing apologizes; every count carries its unit; buttons say exactly what they do.

---

