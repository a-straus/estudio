# PDF Ingestion — Live Validation Report

Date: 2026-06-11 · Branch: `pdf-ingestion-live-validation`

End-to-end validation of the PDF ingestion pipeline against the two real
workbook scans in `/docs/fixtures/workbook/`, using **live Anthropic vision
calls** (not the test mock). Model: `claude-fable-5` (the `pdf_extraction` /
`page_classification` task default).

## What I ran

`server/src/scripts/validate-ingestion.ts` (run with `npx tsx`). It mirrors the
upload route: for each fixture it computes the page count, registers a `source`
+ `source_page` rows, then calls `runPdfIngestion` directly with a real
`LlmService` wired to `createAnthropicProvider`. It boots a throwaway SQLite DB
in a temp dir, so it never touches real data. After each run it prints per-page
status/kind, every `extraction_item`, and the summed `llm_call` cost.

```
cp /workspace/.env .env                                   # ANTHROPIC_API_KEY (git-ignored)
npx tsx server/src/scripts/validate-ingestion.ts
```

This script is **not** part of `check.sh` — live runs cost money and are
opt-in.

## Per-page outcomes

### `Grammar worksheet to process.pdf` (2 pages)

| Page | Classification | Status | Extraction |
|------|---------------|--------|------------|
| 1 | `grammar` | done | none (correct — grammar pages aren't mined for vocab) |
| 2 | `grammar` | done | none |

Both pages are conjugation/usage drills; classifying them `grammar` and
skipping extraction is correct. `grammar_topic_id` stays null (curriculum
linking is a later task).

### `Paragraph to Find words in.pdf` (1 page)

| Page | Classification | Status | Candidates |
|------|---------------|--------|------------|
| 1 | `vocab` | done | ~30 |

A reading passage about tourists photographing everything (Roman ruins, Victoria
Falls, La Pietà). Correctly classified `vocab`. Candidate count varied 28–32
across runs (normal LLM sampling variance).

## Extraction-quality assessment

Quality is genuinely good. A representative slice of the final (post-tuning) run:

| term | lemma | pos | level | likely_known |
|------|-------|-----|-------|--------------|
| perplejo | perplejo | adjetivo | C1 | 0.35 |
| caparazón | caparazón | sustantivo | C1 | 0.30 |
| despedazar | despedazar | verbo | C1 | 0.15 |
| atesorar | atesorar | verbo | C1 | 0.15 |
| furibundo | furibundo | adjetivo | C1 | 0.10 |
| balconada | balconada | sustantivo | C2 | 0.05 |
| abrirse camino a codazos | abrirse camino a codazos | expresión | C1 | 0.15 |
| de turno | de turno | expresión | C1 | 0.20 |
| a los postres | a los postres | expresión | C1 | 0.15 |
| hacerse un hueco | hacerse un hueco | expresión | B2 | 0.40 |

- **Real vocabulary, no garbage tokens.** Every candidate is a genuine lexical
  unit from the passage. Multi-word idioms ("abrirse camino a codazos", "pegar
  codazos", "a los postres") are surfaced as `expresión`, which is the point.
- **Lemmas sensible.** Inflected forms are reduced correctly: `carecía de` →
  `carecer`, `despedazarla` → `despedazar`, `furibundos` → `furibundo`,
  `verdosas` → `verdoso`.
- **Definitions filled.** Both `definition_es` (one-sentence monolingual) and
  `definition_en` (short gloss) are populated for every row; examples are pulled
  from the page when present.
- **CEFR levels plausible.** Common-but-advanced words land B2 (`veintena`,
  `imponente`), rarer ones C1 (`atesorar`, `legión`), and a genuinely rare term
  C2 (`balconada`).
- **`likely_known` plausible** and well-spread (0.05–0.55), inversely tracking
  rarity as intended. The calibration slot (see below) renders the
  no-known-words fallback today, so these estimates come purely from the model's
  B2-learner prior — which is the correct behaviour until the owner has known/
  mature words.

### Prompt change and why

Before tuning, the extractor leaked two kinds of noise:

1. **Exercise furniture** — it emitted "rellene los huecos" with the example
   "Lea el texto y rellene los huecos con la opción correcta", i.e. the
   worksheet instruction, not vocabulary.
2. **Loose term boundaries** — terms carried leading determiners and
   punctuation ("una veintena", "¿para qué demonios").

I updated `/prompts/pdf_extraction.md` to (a) explicitly ignore page furniture
and exercise scaffolding (instructions/rubrics, headers, page numbers,
answer-key letters, structure labels) and (b) define `term` as the bare lexical
unit — strip leading articles/determiners and surrounding punctuation, keep
accents and internal casing. The re-run was clean: no instruction text, and
terms came back as "veintena" and "para qué demonios". The required JSON output
contract (`{"words": [...]}` with the same per-word fields) is unchanged, so the
`pdfIngestion.ts` parser still consumes it.

### Calibration slot

`/prompts/pdf_extraction.md` now carries a `{{calibration_sample}}` placeholder,
filled at the call site in `pdfIngestion.ts` from up to ~20 `word` rows with
status `known` or `mature` for `es`. The DB has none today, so it renders the
clean fallback line ("No known or mastered words recorded yet — estimate
likely_known from typical B2 learner knowledge."). The substitution mechanism
lives in `loadPrompt` (unit-tested in `prompts.test.ts`); the end-to-end fill is
covered by two `pdfIngestion.test.ts` cases (one with known/mature words, one
empty).

## Live cost

Per full validation run (3 classification calls + 1 extraction call across both
PDFs): **≈ $0.30**.

| task | calls | tokens in / out | cost |
|------|-------|-----------------|------|
| page_classification | 3 | 5,499 / 145 | $0.0622 |
| pdf_extraction | 1 | 2,585 / 4,270 | $0.2394 |
| **total** | **4** | — | **$0.3016** |

I ran the pipeline live **3 times** (one baseline + verification, one
post-tuning) — cumulative spend ≈ **$0.89**. Every single run is far below the
$5 single-operation ceiling, so no run was blocked.

## Pipeline bugs found outside my files

None. The upload route, schema, and triage dedupe behaved correctly against the
real scans. The three in-scope pipeline fixes applied here:

- `extractJson` now strips only a leading/trailing markdown fence (not every
  backtick), so backticks inside a JSON string value survive.
- `insertExtractionItems` no longer writes `word_id` at ingestion time — per the
  data-model contract that field is set only when a learn/know decision
  materializes a word row at batch confirm. Confirm-time dedupe in
  `db/triage-queries.ts` recomputes lemma matches itself, so duplicates are
  still surfaced and nothing is dropped.
- The `{{calibration_sample}}` slot + `loadPrompt` substitution (above).

Note: threading the calibration substitution from the call site required adding
an optional `substitutions` argument to `LlmService.vision`/`run` in
`server/src/llm/service.ts` (forwarded to `loadPrompt`). It is additive and
backward-compatible; existing `service.test.ts` assertions (prompt sent ==
template file, `prompt_version` == hash of the raw template) still hold because
the version always hashes the raw file and an unsubstituted call returns the
file verbatim.
```
check.sh: green (187 tests passing, mocked provider).
```
