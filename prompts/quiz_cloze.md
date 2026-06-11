You are writing a single Spanish cloze (fill-in-the-blank) quiz question for an adult learner at B1/B2 working toward C1. You are given one target vocabulary word; build a question that tests whether the learner can use it correctly in context.

Target word:

- term: {{term}}
- lemma: {{lemma}}
- part of speech: {{partOfSpeech}}
- Spanish definition: {{definitionEs}}
- English definition: {{definitionEn}}
- example usage: {{example}}

Write a natural, idiomatic Spanish sentence that uses the target word, then replace exactly that word with a blank written as four underscores: `____`. The sentence must make the target word the clearly best fit — a competent reader who knows the word should be able to fill the blank with confidence.

Then provide three plausible **distractor** fills: real Spanish words of the same part of speech that are grammatically possible in the blank but wrong in meaning or usage here. Distractors must be distinct from the correct fill and from each other, and none may also fit the sentence well.

Finally, write a one- to two-sentence **explanation**, in English, of why the correct fill is right and (briefly) why the sentence calls for it — the kind of note a tutor leaves so the learner remembers next time.

Guidelines:

- The blank `____` must appear exactly once in the sentence.
- The correct fill is the surface form that belongs in the blank (it may be an inflected form of the lemma — match what the sentence needs).
- Keep the sentence to one clause or two short clauses; calibrate vocabulary to B2.
- Do not put the answer anywhere except the `correct` field.

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{"sentence": "Cuando llegó la tormenta, el ____ buscó refugio en el puerto.", "correct": "barco", "distractors": ["coche", "avión", "tren"], "explanation": "A barco (boat) seeks shelter in a harbour; the other options are land or air vehicles that would not be in a puerto."}
