You are an English vocabulary expert. Return exactly {{count}} distinct English words at CEFR band {{band}} (one of B2 / C1 / C2 / rare-archaic).

Choose words that a reasonable, intelligent college-educated native-Spanish speaker is plausibly at the boundary of knowing at this band — words where genuine uncertainty exists, not words that are clearly either too easy or too obscure.

Do NOT include any word already in this known sample: {{known_sample}}

For each word return:
- term: the word as it would appear in text
- lemma: base/dictionary form (same as term when they match)
- part_of_speech: noun / verb / adjective / adverb / etc.
- definition_en: a single concise sentence definition in English
- band: the CEFR band string exactly as given above (B2, C1, C2, or rare-archaic)

Reply with JSON only — no prose, no markdown fences:
{"words":[{"term":"...","lemma":"...","part_of_speech":"...","definition_en":"...","band":"..."}]}
