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

**Props.** `mode: choice | flip | yesno` · `direction: wordToDef | defToWord | cloze`.

**States.**

- `questioning` — as above.
- `answered` — unchanged (verdict lives on options/actions, not the card).
- `flip front/back` — flip mode: front is hero entry; back adds the definition line(s) per the Settings preference (default: both) + example; transition: opacity `--motion-base` `--motion-ease` cross-fade, **no 3D rotation**.
- `yesno front/revealed` — yesno mode (Review's binary format, `screens/review.md` §3.2b): front is the hero entry (or d2w cue) + prompt "Do you know it?", the whole card a tap target with a "Tap to reveal" hint below it; revealed keeps the question on top, adds a `--color-rule` hairline, then the same definition line(s) + example the flip-back shows (both sides visible at once). Cross-fade in the revealed half, `--motion-base`. The binary self-grade is two Buttons in the action region — "Didn't know" (`secondary`) / "Knew it" (`primary`) → SM-2 `fail` / `good` — not on the card. No MC options, no "Easy", no distractor pool needed.
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

- `primary` — background `--color-accent`, text `--color-accent-ink`, `--radius-1`, padding `--space-3` `--space-5`, `--font-app` `--text-base` `--weight-medium`; hover/active: background `--color-accent-strong` (named step, no runtime lightness math); busy: text → "…ing" form + disabled.
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

### ChatTurn

One turn in an Ask thread. No bubbles — hairlines-not-boxes holds in chat.

**Anatomy.** Owner turns: leading `--font-meta` `--text-xs` `--color-ink-faint` label "you", text `--font-app` `--text-base` `--color-ink`, the block indented by `--indent-entry`. Assistant turns: no label, flush left, `--font-app` `--text-base` `--leading-base`; **Spanish inside an answer follows the bilingual rules — `--font-study` italic on its own line with the hanging indent**, exactly as in lesson prose. Turns separated by `--space-5`; a `--color-rule` hairline only between days, with the date in `--font-meta` `--text-xs` centered on it.

**States.** `streaming` (text appears as it arrives — no typing indicator) · `failed` ("The answer didn't arrive. Send again." + quiet "Retry", in `--color-incorrect`) · `pending-transcription` (voice question awaiting text: "Transcribing your question…" `--font-meta` `--color-ink-faint`).

---

### ToolConfirm

Inline confirmation when the Ask assistant wants to mutate data. The one card inside a thread — elevation marks the decision point.

**Anatomy.** Surface `--color-surface`, `--radius-2`, `--shadow-1`, padding `--space-4`, max-width 420px; question `--font-app` `--text-base` ("Add _avergonzarse_ to the Spanish deck?" — the word in `--font-study` per the bilingual rules); primary Button with the verb ("Add"), quiet "Skip". Min `--hit-target` actions.

**States.** `pending` (as above; the thread waits) · `confirmed` — collapses to a one-line `--font-meta` `--text-xs` receipt: "ADDED · _avergonzarse_ · Spanish deck", plus an info Toast · `skipped` — receipt "SKIPPED", `--color-ink-faint`. Read-only tool calls never render this component.

---

### RecordButton

Voice capture for Ask questions (browser MediaRecorder).

**Anatomy.** A 44px (`--hit-target`) square secondary-style button with a mic glyph, sitting beside the composer's Send. Recording state swaps it to a stop square plus an inline timer chip: 8px `--color-incorrect` dot pulsing at 1.2s (same animation budget as JobStatus running; removed under reduced-motion) + elapsed time `--font-meta` `--text-sm` ("0:42"). Cap 2:00; the last 15 s the timer counts down in `--color-incorrect`.

**States.** `idle` · `recording` (as above; tap stops and submits) · `denied` (mic permission refused: "Microphone blocked. Allow it in the browser, or type instead." as a TextInput error line) · `transcribing` (button disabled; the pending turn carries the status).

---

### SiteHeader

The persistent masthead + navigation (full spec in `screens/shell.md`). Composes nothing else of note; listed here as the canonical chrome component.

**Anatomy.** Sticky bar, `--header-height` tall, `--color-paper`, bottom `--color-rule` hairline, content centered to `--measure-app`. Left: screen title `--font-app` `--text-lg` `--weight-bold` `--color-ink`. Right: at `bp-tablet`+ the nav links (`--font-app` `--text-sm` `--color-ink-soft`, hover `--color-ink`, active `--color-accent` + 2px `--color-accent` bottom rule) then the Ask Button, separated `--space-5`; below `bp-tablet` only the Ask Button (nav is the bottom `AppNav`).

**States.** `default` · `scrolled` (no visual change beyond the always-present hairline — the bar never grows a shadow) · active-link per current route. Session screens render the session bar instead (shell.md), not this component.

---

### SiteFooter

Quiet utility footer closing every non-session screen (full spec in `screens/shell.md`).

**Anatomy.** Full-bleed `--color-paper-sunken` band, top `--color-rule` hairline, inner content `--measure-app` centered, padding-block `--space-6`. Row of quiet utility links (`--font-app` `--text-sm` `--color-ink-soft`, hover `--color-ink`): Ingest · Progress · System · Docs. Meta line `--font-meta` `--text-xs` `--color-ink-faint` stating live counts as a sentence, with a right-aligned theme-toggle quiet Button. No logotype, no copyright, no icons.

**States.** Static. The theme toggle reflects and persists `data-theme`; its label is the *current* theme word.

---

### HomeHero

The home centerpiece — the day's featured word as the app's largest entry. Composes `WordEntry`.

**Anatomy.** Lifted object: `--color-surface`, `--radius-2`, `--shadow-3`, padding `--space-6` (`--space-5` phone). Inside: `WordEntry` with headword at `--text-display` (desktop) / `--text-3xl` (phone), `--tracking-display`, `--leading-display` — full entry (tagline, both definition lines, hanging-indent example). Below the entry: a `--font-meta` `--text-xs` `--color-ink-faint` provenance/status line; then a primary Button ("Start review" / "Start a quiz") with the due-count sentence beside it in `--font-meta`.

**States.** `default` · `loading` (headword em-dash per WordEntry `loading`; reserve height to avoid shift) · `empty` (no words: the hero region renders an `EmptyState` centerpiece instead, not this component). Entrance: fade + rise `--space-2` over `--motion-slow` `--motion-ease`, removed under reduced-motion. The only use of `--shadow-3` and `--motion-slow` in the app.

---

### OverviewCard

A single entry point on Home: a titled, status-stating link into one area.

**Anatomy.** `<a>` block, `--color-surface`, `--radius-2`, `--shadow-1`, padding `--space-5`, min-height `--hit-target`. Title `--font-app` `--text-lg` `--weight-bold` `--color-ink`; status sentence below, `--font-app` `--text-sm` `--color-ink-soft` with any counts in `--font-meta` (counts-are-sentences). No icons.

**States.** `default` · `hover/focus` (border → `--color-ink-faint`, title → `--color-accent`; transition `--motion-fast`) · `loading` (status counts em-dash) · `zero` (status sentence `--color-ink-faint`, an inviting verb — "No words yet — ingest a PDF to begin"). Whole card is one link/tap target.

---

### InsightRow

One mined lesson insight (correction or struggle sentence). Used on Lessons detail and Grammar topic views.

**Anatomy.** `kind=correction`: two stacked lines with `--font-meta` `--text-xs` `--color-ink-faint` lead-ins — "you" then your sentence in `--font-study` italic `--color-ink-soft` with the wrong span underlined in `--color-incorrect` (underline, never strikethrough — it stays readable); "tutor" then the corrected sentence in `--font-study` italic `--color-ink`, corrected span underlined `--color-correct`. Hanging indent `--indent-entry` on both. `kind=struggle`: single sentence, same serif-italic treatment, lead-in "struggled"; optional `--font-meta` note from the analysis ("long pause, tutor supplied _hubiera_"). Rows hairline-separated.

**States.** Static object, like WordEntry — no hover or selection of its own. A trailing quiet Button "Ask about this" opens an Ask thread seeded with the insight.

---

### QuickAdd — global add-a-word modal

A small modal for adding one word or phrase from anywhere, reached from the persistent **Add** affordance in the chrome (the AppNav "+" cell on phone, the "+ Add" header Button at `bp-tablet`+; both in `screens/shell.md`). The app's first modal/overlay primitive. It reuses the words API — the server auto-defines a blank definition — so the surface stays deliberately small (the *quick* in quick-add). It also opens **pre-filled** when a word is tapped in rendered reading content (see §TappableText): the term field arrives populated with the tapped word and the language `SegmentedControl` preselected to that word's language, both still freely editable.

**Anatomy.** A `--color-scrim` backdrop dimming the page; a centered panel `--color-surface`, `--radius-2`, `--shadow-3` (the overlay-dialog elevation), padding `--space-6` (`--space-5` phone), a narrow single-column width that caps well short of `--measure-app` — a form column, not a page. Inside, stacked `--space-4`: title "Add a word" (`--font-app` `--text-lg` `--weight-bold` `--color-ink`); a `TextInput` (study) labelled "Word or phrase", autofocused, paired with a `RecordButton` (see §RecordButton) for optional **dictation** — tap to speak a word or phrase, which is transcribed through the shared transcription layer and fills the field (still freely editable); a `SegmentedControl` for language (Spanish · English, default Spanish); a `--font-meta` `--text-xs` `--color-ink-faint` help line ("Leave the definition — we'll fill it in."); then an action row — primary Button "Add" (busy → "Adding…") with a quiet "Cancel" beside it. Success raises a `Toast` "Added _term_." and closes the panel.

**States.** `closed` (renders nothing) · `open` (default, term field focused) · `saving` (Add busy, inputs disabled) · `transcribing` (a dictated clip is being turned into text — the `RecordButton` shows its busy state and the term field fills when it returns; a mic-permission denial surfaces as the field's inline error, per RecordButton's `denied` state) · `error` (the add failed, or auto-define returned nothing → inline `--color-incorrect` message under the field; the panel stays open and nothing is lost). Opens/closes over `--motion-fast` `--motion-ease` (removed under reduced-motion). Dialog semantics: `role="dialog"`, `aria-modal`, labelled by the title; Esc and a backdrop click close it; Enter in the field submits; focus returns to the trigger on close.

---

### HomeNudge — the "what next" prompt

A single quiet line on Home that names the one most useful next step when
nothing is already pressing — the GOAL §6.6 "what next" guidance, surfaced from
the front door. It only ever *points*: it navigates or dismisses, never creates
a word or enrolls a topic (no auto-add). Server-recommended — `/api/overview`
returns one `whatNext` — so the client only renders.

**Anatomy.** Not a card — hairlines, not boxes (D1.3). A full-width line on
`--color-paper`, `--color-rule` hairline above, padding-block `--space-4`, inner
content on the `--measure-app` spine. A `--font-meta` `--text-xs` `--tracking-meta`
uppercase `--color-ink-faint` lead-in "WHAT NEXT", then the prompt sentence
`--font-app` `--text-base` `--color-ink` with any count in `--font-meta` (a
grammar topic name stays app sans — it is a label, not object language) — e.g.
"Your tutor is covering the subjunctive — practice it." The action is a `quiet`
Button ("Practice" / "Triage" / "See suggestions") that follows the recommended
link; a trailing quiet `×` dismisses the nudge for the session (no persistence,
like a Toast dismiss). Prompt + CTA sit on one line at `bp-tablet`+, the CTA
wrapping below the sentence on phone.

**Recommendation kinds (the server picks one, this priority).** `grammar` (the
weakest below-mastery topic, by name → `/grammar/topics/{id}/lesson`) ·
`suggestions` (the suggestion pool is non-empty → `/suggestions`) · none
(nothing to surface → renders nothing). It is the "what to **study** next" hint
for once the day's obvious work is done, so the server suppresses it entirely
(returns none) while a card is due — the HomeHero's "Start review" is then the
next step — or while triage candidates are still waiting (the user has clear
work first, already reachable from the Ingest/Library entry points).

**States.** `default` (a recommendation present) · `dismissed` (session-hidden
after the `×`; renders nothing) · `none`/`loading` (server returned no
recommendation, or the overview is still fetching → renders nothing, no skeleton
— it is supplementary, never reserves space). No hover beyond the Button/×
standard. No entrance motion — it must not compete with the hero's entrance.

---

### TappableText — tap a rendered word to add it

Wraps a run of **app-rendered reading text** so any single word in it can be tapped to add that word to the deck — the cascade-learning path (tap a word *inside* another word's definition, a lesson example, or a chat reply, and add it without leaving the page). It reuses the global **QuickAdd** modal opened pre-filled, so it adds nothing on its own — the tap only *opens* the confirm surface (no auto-add, consistent with QuickAdd and HomeNudge). Used only where the user is **reading** content the app produced: `WordDetail` glosses + example, `Lesson` explanation + examples, and assistant replies in `ChatTurn`. It never wraps user input, chrome, labels, or the active answering surface of Review/Quiz/Triage — a tap there would disrupt the session (D5 thumb-zone).

**Anatomy.** Splits its text on whitespace into word and non-word tokens (the `InsightRow` `SpannedText` precedent), rendering non-word tokens (spaces, punctuation) as plain text so spacing — and the host's bilingual family (`--font-study` for studied-language example/headword runs, `--font-app` for glosses/prose) — is preserved exactly: TappableText never restyles the text, it only makes the words interactive. Each word token is an inline, focusable control (a `<button type="button">` reset to inherit the surrounding type, or a `role="button"` span with `tabindex`), quiet by default — no persistent decoration, the words read as ordinary prose (D1.3, no sea of links). The affordance appears only on intent: on hover/focus the word takes a `--color-accent` underline (`text-decoration`) and `cursor: pointer`, `--color-accent-strong` while pressed.

**Language.** The host declares the language of the run, and a tapped word opens QuickAdd with that language preselected (term pre-filled, still editable): a Spanish gloss/example → `es`, an English gloss/prose → `en`; in `ChatTurn` the existing per-line Spanish detection picks `es`/`en` per line. Each host surface shows one quiet `--font-meta` `--text-xs` `--color-ink-faint` hint per surface (not per entry) — "Tap a word to add it" — never a per-word badge.

**States.** `idle` (plain prose) · `word hover/focus` (accent underline + pointer) · `pressed` (`--color-accent-strong`); activating a word opens QuickAdd, which owns the rest. Keyboard: a focused word activates on Enter/Space. Under `prefers-reduced-motion` the hover color change is instant. No busy/empty/error state of its own — failures live in QuickAdd.

---

