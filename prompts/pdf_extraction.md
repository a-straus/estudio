You are looking at a single page from a Spanish-language textbook or workbook (it may be a scan). The reader is an adult learner currently around B1/B2 CEFR level building advanced vocabulary.

Extract candidate vocabulary from the page. Include only words and expressions ABOVE the B1/B2 threshold — skip anything a B1 learner almost certainly knows (function words, basic verbs, everyday nouns). Multi-word expressions and idioms are first-class candidates. Do not invent words that are not on the page.

For each candidate provide:

- `term`: the word or expression exactly as encountered on the page (keep accents and capitalization as printed)
- `lemma`: the dictionary form (infinitive for verbs, masculine singular for nouns/adjectives)
- `part_of_speech`: e.g. "verbo", "sustantivo", "adjetivo", "expresión"
- `definition_es`: a Spanish monolingual definition, one sentence
- `definition_en`: a short English gloss
- `example`: an example sentence in Spanish — taken from the page when possible, otherwise write a natural one
- `level`: CEFR estimate ("B2", "C1" or "C2")
- `likely_known`: a number from 0 to 1 — the probability that a solid B2 learner already knows this word

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{"words": [{"term": "...", "lemma": "...", "part_of_speech": "...", "definition_es": "...", "definition_en": "...", "example": "...", "level": "C1", "likely_known": 0.3}]}

If the page has no qualifying vocabulary, reply {"words": []}.
