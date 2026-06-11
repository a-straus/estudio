> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.4 Ingest

**Purpose.** Get real material in: PDF scan, pasted text, Gutenberg book, Mochi import. Desktop-first workbench.

**Regions.**

1. _Method tabs_ — SegmentedControl: Upload PDF · Paste text · Gutenberg · Import.
2. _Method panel_ — one of: file drop zone (dashed `--color-rule-strong` border, `--radius-2`); TextInput multiline for paste; TextInput for Gutenberg URL/ID with a fetch step; file picker for Mochi export.
3. _Estimate & confirm_ (Gutenberg and large PDFs) — before any spend: "Moby-Dick · 215,000 words · est. $0.84 · ~12 min". Primary Button "Extract words", quiet "Cancel".
4. _Job progress_ — JobStatus block: stage line ("Reading chapter 41 of 135"), progress fill, honest cost ticker ("$0.31 so far"), quiet Button "Run in background". Completion routes to Triage.

```
Mobile 390px                       Desktop 1280px
┌──────────────────────────┐       ┌──────────────────────────────────────────────┐
│ Ingest                   │       │ Ingest          Today Library Grammar …      │
│ [PDF][Paste][Gutbg][Imp] │       ├──────────────────────────────────────────────┤
│ ┌──────────────────────┐ │       │ [PDF] [Paste] [Gutenberg] [Import]           │
│ │  Drop a PDF scan     │ │       │ ┌──────────────────────────────────────────┐ │
│ │  or tap to choose    │ │       │ │   Drop a PDF scan here, or browse        │ │
│ └──────────────────────┘ │       │ └──────────────────────────────────────────┘ │
│                          │       │ Moby-Dick · 215,000 words · est. $0.84       │
│ Recent                   │       │ [ Extract words ]  Cancel                    │
│ Workbook p.40–61  DONE   │       │ ─────────────────────────────────────────────│
│ Moby-Dick   31 waiting → │       │ Recent: Workbook p.40–61 DONE · Moby-Dick →  │
└──────────────────────────┘       └──────────────────────────────────────────────┘
```

**Responsive.** Mobile keeps all four methods but the drop zone becomes a tap-to-choose row; estimate/confirm stacks. Recent-ingests list is shared with the Today nudge.

**States.**

- _Empty:_ method panel is itself the empty state; "Recent" section hidden until something exists.
- _Loading/job:_ JobStatus as above; leaving the screen is safe and stated: "This keeps running. Progress is in System."
- _Error:_ JobStatus error variant — "Couldn't read 3 pages (smudged scan). 412 words extracted from the rest. Continue to triage, or re-scan pages 12–14." Errors name the next action.
- _Overflow:_ paste box accepts ≥200k chars; shows "215,000 words" count and switches to the estimate step rather than scrolling forever.

---

