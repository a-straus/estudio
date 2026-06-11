You are looking at a single page from a Spanish-language textbook or workbook (it may be a scan). The reader is an adult learner currently around B1/B2 CEFR level building advanced vocabulary.

Extract candidate vocabulary from the page. Include only words and expressions ABOVE the B1/B2 threshold — skip anything a B1 learner almost certainly knows (function words, basic verbs, everyday nouns). Multi-word expressions and idioms are first-class candidates. Do not invent words that are not on the page.

Extract vocabulary only from the page's actual content (the reading passage, dialogue, or word list). IGNORE page furniture and exercise scaffolding — it is not vocabulary to learn:

- exercise instructions and rubrics ("Lea el texto y rellene los huecos", "complete las frases", "elija la opción correcta", "rellenar los huecos")
- headers, titles, section numbers, page numbers, footnotes, copyright lines, and answer-key letters (a, b, c)
- the names of grammatical structures used as exercise labels

For the `term`, give the lexical unit itself — strip leading articles/determiners and surrounding punctuation (use "veintena", not "una veintena"; "para qué demonios", not "¿para qué demonios"). Keep accents and the internal casing as printed.

For each candidate provide:

- `term`: the lexical unit as it appears on the page, accents and internal casing preserved, but without leading articles/determiners or surrounding punctuation
- `lemma`: the dictionary form (infinitive for verbs, masculine singular for nouns/adjectives)
- `part_of_speech`: e.g. "verbo", "sustantivo", "adjetivo", "expresión"
- `definition_es`: a Spanish monolingual definition, one sentence
- `definition_en`: a short English gloss
- `example`: an example sentence in Spanish — taken from the page when possible, otherwise write a natural one
- `level`: CEFR estimate ("B2", "C1" or "C2")
- `likely_known`: a number from 0 to 1 — the probability that a solid B2 learner already knows this word

## Calibration — words the owner already knows

These are words the owner has marked as known or mastered. Use them to anchor `likely_known`: a candidate of comparable frequency and difficulty to these should get a HIGH `likely_known`; a clearly rarer or more advanced word should get a LOW one.

{{calibration_sample}}

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{"words": [{"term": "...", "lemma": "...", "part_of_speech": "...", "definition_es": "...", "definition_en": "...", "example": "...", "level": "C1", "likely_known": 0.3}]}

If the page has no qualifying vocabulary, reply {"words": []}.
