You are writing a single self-contained Spanish grammar lesson for an adult learner at B1/B2 working toward C1. Write in a warm, concise tutor's voice — clear, never padded.

Grammar topic:

- name: {{topicName}}
- description: {{topicDescription}}

{{notes}}Produce two things in one response: (1) a short reading that explains the topic, and (2) a quiz set that tests it.

The explanation:

- 2–5 short paragraphs of plain English explanation, calibrated to B2. Explain when and why the structure is used, and the common mistakes a learner makes. Keep Spanish words inside the prose minimal — full Spanish examples go in the `examples` array, not buried in the paragraphs.
- 3–6 example items, each a natural Spanish sentence that demonstrates the topic with its faithful English gloss.

The quiz set — 4 to 6 questions, choosing the styles that best fit this topic:

- `def_match`: a multiple-choice question. Provide `prompt` (the question), exactly four `options`, and the `correct` option (which must be one of the options verbatim).
- `fill_in`: a fill-in-the-blank. Write `prompt` as a Spanish sentence with the missing piece shown as four underscores `____`, and `correct` as the surface form that belongs in the blank.
- `conjugation`: ask the learner to conjugate or transform a verb. `prompt` states the task (e.g. the infinitive plus the person/tense), and `correct` is the expected form.
- `free_text`: an open prompt asking the learner to produce a sentence or short answer. `prompt` is the instruction; `correct` is a model answer used as a grading reference.

Every question must also carry its own `explanation`: a one- to two-sentence "explain why" note — the reasoning a tutor leaves so the learner remembers next time. Generate it now, alongside the question.

Guidelines:

- Pick styles that suit the topic; a mix is good but do not force a style that does not fit. Aim for at least one that requires production (`fill_in`, `conjugation`, or `free_text`).
- `def_match` must have exactly four distinct options and the `correct` value must appear among them verbatim.
- Any `fill_in` prompt must contain the blank `____` exactly once.

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{
  "explanation": "Plain-English explanation across a few short paragraphs.\n\nUse blank lines between paragraphs.",
  "examples": [
    {"es": "Me alegra que vengas.", "en": "I'm glad you're coming."}
  ],
  "questions": [
    {"style": "def_match", "prompt": "Which sentence uses the subjunctive correctly?", "options": ["Espero que tengas razón.", "Espero que tienes razón.", "Espero que tienes razon.", "Espero que tener razón."], "correct": "Espero que tengas razón.", "explanation": "Verbs of hope trigger the subjunctive in the subordinate clause, so 'tener' becomes 'tengas'."},
    {"style": "fill_in", "prompt": "Quiero que tú ____ (venir) a la fiesta.", "correct": "vengas", "explanation": "'Querer que' takes the subjunctive; the tú form of 'venir' is 'vengas'."},
    {"style": "free_text", "prompt": "Write a sentence using 'ojalá' with the subjunctive.", "correct": "Ojalá llueva mañana.", "explanation": "'Ojalá' always introduces the subjunctive to express a wish."}
  ]
}
