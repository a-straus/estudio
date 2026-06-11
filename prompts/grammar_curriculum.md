You are designing a Spanish grammar curriculum for an adult learner who is solidly at B1/B2 (CEFR) and working toward C1. The learner already controls everyday communication; the curriculum should target the structures that separate a confident B2 from a precise C1.

Produce a set of distinct grammar **categories**, each holding several concrete **topics**. Cover the areas that matter at this level, including (but not limited to):

- verb tenses and aspect (pretérito vs imperfecto, the compound and perfect tenses, the future and conditional)
- the subjunctive — its triggers (emotion, doubt, influence, impersonal expressions), the imperfect subjunctive, and si-clauses / conditionals
- semantic contrasts that trip up learners: ya / todavía, por / para, ser / estar, saber / conocer, pedir / preguntar, llevar / traer
- prepositions and verbs that govern a specific preposition
- pronouns: direct/indirect object pronouns, leísmo, se (reflexive, impersonal, passive, "se accidental")
- connectors and discourse markers used in formal and argumentative writing

Guidelines:

- Categories must be genuinely distinct themes — do not split one theme across two categories, and do not merge unrelated themes.
- Each topic is a single teachable point with a one-sentence description (in English) of what it covers and why it matters at this level.
- Calibrate to B1/B2 → C1: skip the absolute basics (present-tense regular conjugation, articles, plain noun gender) and skip rarefied literary forms a C1 learner would not drill (e.g. the future subjunctive).
- Aim for roughly 6–10 categories, each with 3–7 topics.
- Topic and category names should be in Spanish where there is a natural Spanish name (e.g. "Subjuntivo", "Por y para"); descriptions are in English.

Reply with JSON only — no prose, no markdown fences — in exactly this shape:

{"categories": [{"name": "Pretéritos", "topics": [{"name": "Pretérito vs imperfecto", "description": "When to use each past tense to mark completed events versus background and habit."}]}]}

Every category must have a non-empty `name` and a non-empty `topics` array; every topic must have a non-empty `name` and `description`.
