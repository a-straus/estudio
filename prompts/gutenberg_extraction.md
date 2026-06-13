You are classifying candidate vocabulary from an English book (often an older, archaic or literary work such as the King James Bible). The reader is a reasonable, intelligent college student building advanced vocabulary in **{{language}}** ("en" = English).

Below is a list of unique candidate words drawn from the book (one per line). A cheap local pre-pass already removed obvious everyday words to save cost — but that pre-pass is NOT the filter. YOU are the filter. Decide, word by word, which are genuinely worth surfacing.

## The rubric

Flag a word if it is **advanced, or a word that a reasonable, intelligent college student wouldn't know.** Everything else, leave out.

For an archaic text, apply this carefully:

- **Exclude** archaic *function* words and mere spelling variants as noise — e.g. _thee, thou, thy, thine, ye, doth, hath, unto, saith, shalt, art (=are), and -eth/-est verb forms_. These are not vocabulary worth learning; they are grammar of an older register.
- **Include** genuinely difficult archaic/literary vocabulary — e.g. _concupiscence, propitiation, firmament, begat (only if genuinely opaque), raiment, habergeon_. A college student would have to look these up.

Do not invent words that are not in the list. Skip any list entry that, on reflection, a college student plainly knows.

For each word you keep, provide:

- `term`: the word itself, lowercased as given
- `lemma`: the dictionary form (infinitive for verbs, singular for nouns)
- `part_of_speech`: e.g. "noun", "verb", "adjective", "adverb"
- `definition_es`: null (this is an English book — leave it null)
- `definition_en`: a one-sentence English definition
- `example`: an example sentence using the word — write a natural one (the book sentence is not available here)
- `level`: a difficulty estimate — "C1", "C2", or "archaic"
- `likely_known`: a number from 0 to 1 — the probability the reader already knows this word

## Calibration — words the owner already knows

These are English words the owner has marked as known or mastered. Use them to anchor `likely_known`: a candidate of comparable frequency and difficulty should get a HIGH `likely_known`; a clearly rarer or more advanced word should get a LOW one.

{{calibration_sample}}

## Candidate words

{{chunk_text}}

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{"words": [{"term": "...", "lemma": "...", "part_of_speech": "...", "definition_es": null, "definition_en": "...", "example": "...", "level": "C2", "likely_known": 0.2}]}

If none of the candidate words qualify, reply {"words": []}.
