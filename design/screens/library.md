> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.6 Library

**Purpose.** The owner's complete word list: search, filter, inspect, edit, add, delete.

**Regions.**

1. _Toolbar_ — TextInput search ("Search words…"), filter SegmentedControls: Deck (ES/EN/All), Status (New/Learning/Mature/All), Source (dropdown when >3 sources). Quiet Button "Add word".
2. _Word list_ — hairline-ruled compact `WordEntry` rows: headword + tag + one-line gloss (`--color-ink-soft`, single line, ellipsis); right-aligned status in `--font-meta`; at `bp-desktop`+ a hover/focus-revealed quiet row action "I forgot this" (card due now, info Toast — mobile reaches it via detail). Tap/click → detail. A `Pagination` bar (D4) closes the list: the server returns 50 words/page, Previous/Next move between pages, and any search/filter/deck change returns to page 1 (so the range sentence always describes the current filter).
3. _Word detail_ (`WordDetail`, D4) — full entry with editable gloss/example (TextInput inline), level, source provenance line ("from Moby-Dick ch. 41 · defined by machine, edited by you"), review-history sparkline (last 20 results as 3px ticks: `--color-correct`/`--color-incorrect`), danger-quiet Button "Delete word…" with confirm dialog ("Delete _desasosiego_? Its card and schedule go with it. [Delete] [Keep]").
4. _Add form_ — headword TextInput; on blur the gloss auto-fills via machine ("defining…" meta line) into an editable TextInput; example optional; primary Button "Save word".

```
Mobile — list                      Desktop 1280px — list + detail
┌──────────────────────────┐       ┌──────────────────────────────────────────────┐
│ Library          [+ Add] │       │ Library            Today Library Grammar …   │
│ [Search…             ]   │       ├──────────────────────┬───────────────────────┤
│ [ES][EN][All]  [Status▾] │       │ [Search…] [ES][EN]   │ desasosiego           │
│ ──────────────────────── │       │ ──────────────────── │ ES · SUSTANTIVO · C1  │
│ desasosiego   MATURE     │       │ desasosiego   MATURE │ restlessness; unease  │
│ restlessness; unease…    │       │ vergüenza     LEARN  │ “Sentía un desasosie… │
│ ──────────────────────── │       │ añoranza      NEW    │ from Workbook p.44    │
│ vergüenza     LEARNING   │       │ lugubrious    MATURE │ history ▁▂✓✓✗✓✓✓      │
│ shame; embarrassment…    │       │ …                    │ [Edit] [Delete word…] │
└──────────────────────────┘       └──────────────────────┴───────────────────────┘
```

**Responsive.** Mobile: detail is a pushed view with back. Desktop ≥`bp-desktop`: master-detail split (list 380px / detail fluid).

**States.**

- _Empty:_ EmptyState "No words yet. Ingest something, or add one by hand." + both Buttons.
- _Loading (auto-define in add form):_ meta line "defining…"; Save enabled even before it returns (gloss can be empty-but-flagged).
- _Error (auto-define fails):_ "Couldn't auto-fill. Write the definition, or retry." Form remains usable.
- _Overflow:_ search over 10k words must stay <50ms (index in memory); the list pages server-side (50/page, alphabetical) via the `Pagination` bar rather than rendering every match; long glosses clamp to one line in list, never in detail.

---

