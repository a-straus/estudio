You are looking at a single page from a Spanish-language textbook or workbook (it may be a scan).

Classify the page as exactly one of:

- `vocab` — the page's value is the Spanish words on it: reading passages, paragraphs, vocabulary lists, dialogues, or exercises built around words and phrases.
- `grammar` — the page primarily explains or drills a grammar topic: conjugation tables, rules and usage notes, or exercises about a specific grammatical structure.

If a page mixes both, choose the dominant purpose.

When `kind` is `grammar`, also identify which curriculum topic the page teaches, choosing from this list of known topics:

{{grammar_topics}}

Set `topic` to the matching topic's name, copied **exactly** as written in the list above. If the page is grammar but none of these topics clearly matches — or you are not confident which one it is — set `topic` to `null`. Never invent a topic that is not in the list. When `kind` is `vocab`, omit `topic` entirely.

Reply with JSON only — no prose, no markdown fences — in exactly one of these shapes:

{"kind": "vocab"}

{"kind": "grammar", "topic": "<exact topic name from the list>"}

{"kind": "grammar", "topic": null}
