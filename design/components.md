> D4 component library. Components are composed, never re-invented; every visual value names a token from `design/tokens.md`.

## D4 — Component library

Components are PascalCase; every visual value below names a D2 token. "Mobile" = below `bp-tablet` unless stated.

---

### WordEntry — the signature object

The dictionary-entry rendering of a word. Every other component that shows a word composes this.

**Anatomy.**

1. `headword` — `--font-study`, `--weight-bold`, `--color-ink`, `--leading-tight`. Size by variant (below). When the encountered form differs from its lemma, both render on one line — encountered form, em dash, lemma at `--weight-regular` `--color-ink-soft` (_tuviera — tener_); `compact` shows the encountered form only.
2. `tagline` — `--font-meta`, `--text-xs`, uppercase, `--tracking-meta`, `--color-ink-faint`. Format: `LANG · POS · LEVEL` (e.g. `ES · SUSTANTIVO · C1`). Parts omitted when unknown, separators with them.
3. `gloss` — `--font-app`, `--text-base`, `--leading-base`. `--color-ink` in `full`, `--color-ink-soft` in `compact`. Spanish words carry two definition lines where both exist — the Spanish monolingual definition first, `--font-study` roman (learner text), then the English gloss in `--font-app`; which line(s) appear on answer reveals follows the Settings preference (default: both). `compact` shows the English gloss only.
4. `example` — `--font-study`, italic, `--text-md`, `--leading-base`, `--color-ink-soft`. **Hanging indent: `padding-left: var(--indent-entry); text-indent: calc(-1 * var(--indent-entry))`.** Full variant only.

**Variants (`size` prop).**

- `hero` — review/quiz cards: headword `--text-2xl` (mobile) / `--text-3xl` (desktop); gloss hidden (it's the question).
- `full` — triage current row, word detail: headword `--text-xl`; all four parts.
- `compact` — lists, summaries: headword `--text-base` `--weight-bold` inline with gloss, single line, gloss ellipsized; tagline collapses to level only.

**States.** Static object — no hover/active of its own. Never colored, never animated.

---

### ReviewCard

The active question frame in Review and Quiz.

**Anatomy.** Surface `--color-surface`, `--radius-2`, `--shadow-1`, padding `--space-5`; contains (a) `WordEntry size=hero` _or_ a cloze stem (`--font-study`, `--text-lg`, `--leading-base`, blank rendered as 5 underscores in `--color-accent`), (b) prompt line (`--font-app`, `--text-sm`, `--color-ink-soft`: "Choose the definition." / "Choose the word." / "Complete the sentence.").

**Props.** `mode: choice | flip` · `direction: wordToDef | defToWord | cloze`.

**States.**

- `questioning` — as above.
- `answered` — unchanged (verdict lives on options/actions, not the card).
- `flip front/back` — flip mode: front is hero entry; back adds the definition line(s) per the Settings preference (default: both) + example; transition: opacity `--motion-base` `--motion-ease` cross-fade, **no 3D rotation**.
- Overflow: card max-height 60vh, inner scroll; prompt pinned at top of card.

---

### QuizOption

One of 4 answer choices. `<button>`.

**Anatomy.** Full-width; min-height `--hit-target`; padding `--space-3` `--space-4`; border 1px `--color-rule-strong`; `--radius-1`; background `--color-surface`; text `--font-app` `--text-base` `--leading-snug` `--color-ink`, left-aligned. Cloze options (full sentences) render in `--font-study` `--text-md` instead — object-language rule. Desktop only: key ordinal (`1`–`4`) leading, `--font-meta` `--text-xs` `--color-ink-faint`.

**States.**

- `default` — as above. Hover (pointer): border `--color-ink-faint`.
- `selected` — border 2px `--color-accent` (padding compensates 1px), background `--color-accent-wash`. Transition background `--motion-fast`.
- `correct` — border 2px `--color-correct`, background `--color-correct-wash`; trailing word "Correct" `--font-meta` `--text-xs` `--color-correct`.
- `incorrect` — border 2px `--color-incorrect`, background `--color-incorrect-wash`; trailing "Your answer".
- `disabled` (others after verdict) — text and border at `--color-ink-faint` / `--color-rule`; no hover.
- `focus` — 2px `--color-focus` outline, offset 2px.

---

### TriageRow

One extracted word in the triage list.

**Anatomy.** `current`: surface `--color-surface`, `--radius-2`, `--shadow-1`, padding `--space-4`; contains `WordEntry size=full` + action row of three Buttons: Know (secondary), Learn (primary), Skip (quiet) — each min `--hit-target`, desktop with key hints `K / L / S`.

**States.**

- `upcoming` — flat row, hairline below; `WordEntry compact` with gloss `--color-ink-soft`; if its definition is still generating, gloss = "defining…" `--font-meta` `--color-ink-faint`.
- `current` — as anatomy; scrolled to center on advance (`--motion-base`).
- `decided` — collapses to one line: compact entry + decision stamp right-aligned (`--font-meta` `--text-xs`; KNOW `--color-ink-faint`, LEARN `--color-accent`, SKIP `--color-ink-faint` strikethrough headword).
- `error` — gloss replaced by "definition failed — write one in Library, or retry" with inline retry quiet Button; still sortable.

**Mobile.** Actions order Learn / Know / Skip, Learn full-width first; row paddings `--space-3`.

---

### WordDetail

Library detail panel. Composes `WordEntry size=full` with editing.

**Anatomy.** Entry at top; `gloss` and `example` become TextInputs on "Edit"; provenance line `--font-meta` `--text-xs` `--color-ink-faint` ("from Moby-Dick ch. 41 · machine-defined, edited by you"); history sparkline: last 20 reviews as 3×12px ticks, gap `--space-1`, `--color-correct` / `--color-incorrect`, `--radius-1`; status + due line in `--font-meta` ("MATURE · next review Jun 21"); footer: quiet Buttons "I forgot this" (card due now, SM-2 demoted; info Toast "_vergüenza_ · due now") and "Edit", danger Button "Delete word…".

**States.** `viewing` / `editing` (inputs + primary "Save", quiet "Cancel") / `saving` (Button busy) / `confirm-delete` (inline dialog, `--shadow-2`: "Delete _vergüenza_? Its card and schedule go with it." danger "Delete" + quiet "Keep").

---

### ProgressStat

A count with its unit, as a sentence fragment.

**Anatomy.** Count `--font-app` `--text-xl` `--weight-bold` `--color-ink`; unit word after, `--text-base` `--color-ink-soft`; optional sub-line `--font-meta` `--text-xs`. No box, no icon. Siblings separated by hairline rules (`--color-rule`), gap `--space-5`.

**States.** `loading` (count = em-dash) · `zero` (count `--color-ink-faint`).

---

### JobStatus

The machine reporting on itself. Used in Ingest, Quiz setup, Grammar, System.

**Anatomy.** All `--font-meta`. Status dot 8px (`running`: `--color-accent`, pulses opacity 1→0.4 at 1.2s — the only looped animation in the app, removed under reduced-motion; `queued`: `--color-rule-strong`; `done`: `--color-correct`; `failed`: `--color-incorrect`); stage line `--text-sm` `--color-ink` ("Reading chapter 41 of 135"); progress track 4px `--radius-pill` `--color-rule` with `--color-accent` fill; cost ticker `--text-xs` `--color-ink-faint` ("$0.31 so far"); optional quiet Buttons "Cancel" / "Run in background".

**States.** `running` / `queued` / `done` (line + duration) / `failed` (`--color-incorrect` stage line stating what happened and the next action, + "Retry").

---

### Toast

Transient confirmation, bottom-center (mobile: above AppNav), max-width 420px.

**Anatomy.** `--color-ink` background, `--color-paper` text (inverts in dark theme), `--radius-2`, `--shadow-2`, padding `--space-3` `--space-4`, `--font-app` `--text-sm`; optional action ("Undo") as an underlined link in the same `--color-paper` text at `--weight-medium` — accent color is illegible on the ink background, so the underline carries the affordance.

**States.** `info` (default, auto-dismiss 4s) · `error` (leading 8px `--color-incorrect` dot, persists until dismissed) · entrance: translateY `--space-2` + fade, `--motion-base`.

---

### Button

**Variants.**

- `primary` — background `--color-accent`, text `--color-accent-ink`, `--radius-1`, padding `--space-3` `--space-5`, `--font-app` `--text-base` `--weight-medium`; hover: background lightness +0.04; active: −0.04; busy: text → "…ing" form + disabled.
- `secondary` — transparent, border 1px `--color-rule-strong`, text `--color-ink`; hover border `--color-ink-faint`.
- `quiet` — no border, text `--color-accent`, underline on hover; for tertiary actions and links-that-act.
- `danger` — as secondary but text/border `--color-incorrect`; only ever behind a confirm.
- All: min-height `--hit-target` on mobile (36px allowed at `bp-desktop`+), `disabled`: text `--color-ink-faint`, border `--color-rule`, no pointer; `focus`: standard outline.

---

### TextInput

**Anatomy.** Background `--color-surface`, border 1px `--color-rule-strong`, `--radius-1`, padding `--space-3`, `--font-app` `--text-base`; label above, `--text-sm` `--weight-medium`; help/error line below `--text-sm`. Multiline variant for paste/gloss editing (min-height 3 lines, auto-grow to 12).

**States.** `default` · `focus` (border `--color-accent` + standard outline) · `error` (border `--color-incorrect`, message in `--color-incorrect`) · `disabled` (background `--color-paper`, text `--color-ink-faint`). When content is studied-language (headword field, example field) the input text uses `--font-study` — the rule holds even in forms.

---

### SegmentedControl

Single-choice row: Deck, Length, Style, Direction, Ingest method, Library filters.

**Anatomy.** Container border 1px `--color-rule-strong`, `--radius-1`, segments equal-width, min-height `--hit-target` (mobile); segment text `--font-app` `--text-sm` `--color-ink-soft`.

**States.** `selected` — background `--color-accent-wash`, text `--color-accent` `--weight-medium`; 1px `--color-rule-strong` divider between segments; `focus` outline on segment; wraps to a second row below 400px rather than shrinking under `--hit-target`.

---

### EmptyState

**Anatomy.** Centered in the vacated region, never full-screen drama: message `--font-app` `--text-base` `--color-ink-soft`, one sentence, ending in an invitation; one Button (quiet or secondary) directly under, gap `--space-3`. No illustrations, no icons.

**Canonical strings:** see D5 microcopy table.

---

