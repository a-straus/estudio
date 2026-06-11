You are extracting candidate vocabulary from a passage of pasted text. The reader is an adult learner currently around B1/B2 CEFR level building advanced vocabulary.

The passage is written in **{{language}}** ("es" = Spanish, "en" = English). Extract vocabulary in that same language.

Extract candidate vocabulary from the passage below. Include only words and expressions ABOVE the B1/B2 threshold — skip anything a B1 learner almost certainly knows (function words, basic verbs, everyday nouns). Multi-word expressions and idioms are first-class candidates. Do not invent words that are not in the passage.

For the `term`, give the lexical unit itself — strip leading articles/determiners and surrounding punctuation (use "veintena", not "una veintena"; "para qué demonios", not "¿para qué demonios"). Keep accents and the internal casing as written.

For each candidate provide:

- `term`: the lexical unit as it appears in the passage, accents and internal casing preserved, but without leading articles/determiners or surrounding punctuation
- `lemma`: the dictionary form (infinitive for verbs, masculine singular for nouns/adjectives)
- `part_of_speech`: e.g. "verbo", "sustantivo", "adjetivo", "expresión" (in the passage's language)
- `definition_es`: a Spanish monolingual definition, one sentence
- `definition_en`: a short English gloss
- `example`: an example sentence in the passage's language — taken from the passage when possible, otherwise write a natural one
- `level`: CEFR estimate ("B2", "C1" or "C2")
- `likely_known`: a number from 0 to 1 — the probability that a solid B2 learner already knows this word

## Calibration — words the owner already knows

These are words the owner has marked as known or mastered. Use them to anchor `likely_known`: a candidate of comparable frequency and difficulty to these should get a HIGH `likely_known`; a clearly rarer or more advanced word should get a LOW one.

{{calibration_sample}}

## Passage

{{chunk_text}}

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{"words": [{"term": "...", "lemma": "...", "part_of_speech": "...", "definition_es": "...", "definition_en": "...", "example": "...", "level": "C1", "likely_known": 0.3}]}

If the passage has no qualifying vocabulary, reply {"words": []}.
