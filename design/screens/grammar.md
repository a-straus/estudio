> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.7 Grammar

**Purpose.** Generated Spanish grammar lessons: pick a topic, read comfortably, take the lesson quiz, ask why.

**Regions.**

1. _Topic list_ — grouped by theme (e.g. Subjuntivo, Pretéritos, Por/Para): rows with topic title (`--font-app` `--text-base`), mastery in `--font-meta` ("quizzed twice · 80%", or "unread"; once lesson recordings exist, the same meta line carries "seen in 3 lessons", linking to that topic's `InsightRow`s — corrections and struggle sentences mined from lessons, see screens/lessons.md). No percent rings. Above the list, the _practice queue_: up to 3 low-mastery topics under a `--font-meta` header "PRACTICE NEXT", same row anatomy + quiet Button "Review".
2. _Lesson view_ — long-form reading column, max `--measure-reading`: title (`--text-xl`), body `--font-app` `--text-md` `--leading-loose`; **all Spanish examples inside the lesson are `--font-study` italic on their own lines with the hanging indent** — same object language rule as everywhere. Sticky footer Button "Take the quiz" appears after 60% scroll, always present at end.
3. _Lesson quiz_ — same session components; includes free-text answers: TextInput + "Check" → machine grades to Correct / Partly / Incorrect with a one-line reason; "Explain why" expands the full reasoning.

```
Mobile — lesson                    Desktop — lesson (680px column)
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│ ← Subjuntivo: triggers   │       │ Subjuntivo: emotion triggers         │
│                          │       │ READ TWICE · LAST QUIZ 80%           │
│ Body text at 18/1.65 …   │       │                                      │
│ … plain explanation …    │       │ Body … comfortable measure …         │
│                          │       │    Me alegra que vengas.             │
│    Me alegra que vengas. │       │    Temía que no llegara.             │
│                          │       │ Body continues …                     │
│ … body continues …       │       │                                      │
│ [    Take the quiz    ]  │       │ [ Take the quiz ]                    │
└──────────────────────────┘       └──────────────────────────────────────┘
```

**Responsive.** Reading column is fluid to `--measure-reading`; mobile margins `--space-4`.

**States.**

- _Empty (no lessons yet):_ topic rows exist (curriculum AI-seeded on first run — generated, stored, editable; never hardcoded); unread topics marked "unread". Lesson generates on first open: JobStatus "Writing the lesson… ~40s" with streamed paragraphs appearing as they arrive.
- _Loading:_ streamed generation as above; quiz Button disabled until complete.
- _Error:_ "The lesson didn't finish. Retry, or read the partial draft below." Partial text stays readable.
- _Overflow:_ lessons may run 2,000+ words — fine by design; a thin reading-progress fill on the top hairline, no chapter pagination.

---

