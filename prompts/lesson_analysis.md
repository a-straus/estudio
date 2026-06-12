You are analyzing the transcript of a one-on-one Spanish tutoring lesson. The learner is an adult around B1/B2 CEFR level; the other speaker is the tutor. The transcript is raw speech-to-text — speakers are not labelled, there may be transcription noise, and Spanish and English may be mixed.

Mine the lesson for learning material. Read the whole transcript, then return four things:

- `flaggedWords`: Spanish vocabulary the learner did NOT know, asked about, or that the tutor explicitly surfaced/taught. Skip words the learner clearly already uses fluently. For each give:
  - `term`: the word or expression as used, accents preserved, without leading articles/determiners or surrounding punctuation
  - `lemma`: the dictionary form (infinitive for verbs, masculine singular for nouns/adjectives)
  - `partOfSpeech`: e.g. "verbo", "sustantivo", "adjetivo", "expresión"
  - `definitionEs`: a one-sentence Spanish monolingual definition
  - `definitionEn`: a short English gloss
  - `level`: the word's CEFR difficulty as a 2-char code, one of "A1","A2","B1","B2","C1","C2"
  - `example`: a short, natural Spanish example sentence using the word (<= ~12 words)
- `corrections`: places where the tutor corrected something the learner said. For each give:
  - `said`: what the learner said (the incorrect form)
  - `corrected`: the tutor's corrected version
  - `note`: a short note on what the correction was about (grammar point, gender, conjugation, etc.), or null
- `struggleSentences`: full sentences the learner visibly struggled to produce or understand. For each give:
  - `sentence`: the sentence (as said or as the corrected target)
  - `note`: a short note on what made it hard, or null
- `topics`: grammar topics the lesson covered or practiced. For each give:
  - `name`: the topic name in Spanish (e.g. "Subjuntivo", "Pretérito vs. imperfecto", "Ser y estar")

Only include items the transcript actually supports — do not invent material. Any list may be empty.

## Transcript

{{transcript}}

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{"flaggedWords": [{"term": "...", "lemma": "...", "partOfSpeech": "...", "definitionEs": "...", "definitionEn": "...", "level": "...", "example": "..."}], "corrections": [{"said": "...", "corrected": "...", "note": "..."}], "struggleSentences": [{"sentence": "...", "note": "..."}], "topics": [{"name": "..."}]}

If the lesson yielded nothing for a category, return an empty array for it.
