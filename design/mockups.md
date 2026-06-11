> D6 — reference mockups. Each HTML file embeds the D2 token block verbatim and is the styling source of truth — lift values from the CSS, not screenshots.

## D6 — Reference mockups in code

Three static, dependency-free HTML files ship alongside this document. **Each embeds the D2 `:root` block verbatim** (plus the dark token set, activated by setting `data-theme="dark"` on `<html>`) and is the styling source of truth — lift values from the CSS, not from screenshots. The outer dark backdrop and frame chrome in each file are mockup scaffolding, not part of the app.

| File                             | Implements                                        | Width             | Shows                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Mockup A - Mobile Review.html`  | D3 §3.2 + ReviewCard, QuizOption, Button          | 390px frame       | Mid-question, option ② selected, pre-verdict; thumb-zone action region                                                                                                         |
| `Mockup B - Desktop Triage.html` | D3 §3.5 + TriageRow (all states), JobStatus tally | 1280px frame      | Mid-batch: 2 decided rows, current row raised, 2 upcoming (one "defining…"), sticky tally footer, key hints                                                                    |
| `Mockup C - Spanish Flows.html`  | D3 §3.2 post-answer + §3.7 lesson & quiz          | 390px ×2 + 1100px | (1) ES cloze answered-correct with explain panel; (2) grammar MC with full-sentence serif options, one selected; (3) generated lesson, long-form reading with Spanish examples |

Component class names in the mockups match D4 names in kebab-case (`.review-card`, `.quiz-option`, `.triage-row`, `.word-entry`) so agents can map markup → component 1:1.
