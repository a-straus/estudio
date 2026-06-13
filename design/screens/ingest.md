> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.4 Ingest

**Purpose.** Get real material in: PDF scan, pasted text, Gutenberg book, Mochi import. Desktop-first workbench.

**Regions.**

1. _Method tabs_ — SegmentedControl: Upload PDF · Paste text · Lesson audio · Gutenberg · Import.
2. _Method panel_ — one of: file drop zone (dashed `--color-rule-strong` border, `--radius-2`); TextInput multiline for paste; audio drop zone for lesson recordings (m4a/mp3/ogg/wav, ~60 min: "Drop a lesson recording, or browse"); TextInput for Gutenberg URL/ID with a fetch step; file picker for Mochi export.
3. _Estimate & confirm_ (Gutenberg, large PDFs, and lesson audio) — before any spend: "Moby-Dick · 215,000 words · est. $0.84 · ~12 min", or for audio "Lesson · 58 min · est. $0.40 transcription + $0.15 analysis". Primary Button "Extract words" / "Mine the lesson", quiet "Cancel".
4. _Job progress_ — JobStatus block: stage line ("Reading chapter 41 of 135" / "Transcribing… 12 of 58 min"), progress fill, honest cost ticker ("$0.31 so far"), quiet Button "Run in background". Completion routes to Triage; lesson audio routes to the lesson's detail on Lessons.

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

**Responsive / desktop-only (owner directive, iter 149).** Ingest is a **desktop task**: at `bp-tablet`+ (≥640px) the workbench renders as specified above. **Below `bp-tablet` (phone, <640px) the screen is disabled** — the `/ingest` route renders a plain desktop-only notice (via `EmptyState`, no action Button) instead of the workbench, and every phone entry point to it is hidden: Home's _Ingest_ OverviewCard + both "Ingest a source" Buttons, and Review's empty-state "Ingest" Button. (The desktop masthead _Ingest_ link is already `bp-tablet`+ only — SiteHeader nav is hidden on phone — so it needs no change.) The notice copy (sans, plain, names the next action):

> **Ingest is desktop-only.** Adding sources — PDFs, pasted text, books — works best on a laptop. Open this page on your computer; you'll review the kept words here on your phone.

Detection is **viewport width** via the existing 640px breakpoint (`matchMedia("(max-width: 639px)")`), never user-agent sniffing. This deliberately **waives the GOAL §15 "PDF ingestion works on a phone browser" sub-criterion** per the owner's explicit override (QUESTIONS "Disable /ingest on mobile" → option A; DECISIONS iter 149). The "Mobile 390px" mockup above is superseded for phone (it predates this directive). Everything else — review, triage, quiz, grammar, library — stays phone-primary and unchanged.

**States.**

- _Empty:_ method panel is itself the empty state; "Recent" section hidden until something exists.
- _Loading/job:_ JobStatus as above; leaving the screen is safe and stated: "This keeps running. Progress is in System."
- _Error:_ JobStatus error variant — "Couldn't read 3 pages (smudged scan). 412 words extracted from the rest. Continue to triage, or re-scan pages 12–14." Errors name the next action.
- _Overflow:_ paste box accepts ≥200k chars; shows "215,000 words" count and switches to the estimate step rather than scrolling forever.

---

