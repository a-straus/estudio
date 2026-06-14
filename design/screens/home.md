> Home / landing overview — the `/` route. Read with `design/tokens.md`,
> `design/screens/shell.md`, and `design/components.md`.
> Structural reference (not identity): merriam-webster.com's homepage — a single
> centerpiece (their Word of the Day) over a small grid of clear entry points,
> set on calm whitespace. We borrow that shape; the centerpiece is a real
> dictionary entry from *your* study, and the look stays The Entry (D0/D1).

## Purpose

`/` is a **navigable overview, not a working screen** (per FEEDBACK: the root
URL must not drop you straight into a task). It orients: one featured word, the
day's work stated as sentences, and a clear path into each area. Every number
here is a sentence (D1.5); the page composes existing components — it invents no
new typography.

## Layout

Within SiteHeader (with Home active) and above SiteFooter. Content spine
`--measure-app`, centered. Three stacked bands, generous vertical rhythm
(`--space-9` between bands on desktop, `--space-7` on phone), plus an optional
slim **What-next** nudge between the hero and the grid (absent when there is
nothing to surface — it never reserves space).

### 1 — Hero band (the centerpiece)

A single featured word rendered as the largest dictionary entry in the app —
the day's "word to study": the next-due card, or, when nothing is due, a mature
word worth revisiting (server's pick; never empty while the user has any word).

- Composed from **`HomeHero`** (new component) wrapping `WordEntry` at the new
  `display` size. Full entry: headword (`--font-study` `--text-display` desktop
  / `--text-3xl` phone, `--tracking-display`, `--leading-display`), tagline,
  both definition lines, hanging-indent example.
- Under the entry, a `--font-meta` `--text-xs` `--color-ink-faint` provenance
  line ("from your library · due today" / "mature · last seen Jun 2").
- Primary action under that: **"Start review"** (primary Button) → `/review`,
  with the due count as its own sentence beside it ("23 due today" in
  `--font-meta`); when nothing is due, the primary becomes **"Start a quiz"** →
  `/quiz` and the sentence reads "nothing due — keep it warm".
- Entrance: hero fades + rises `--space-2` over `--motion-slow` `--motion-ease`
  on first paint (removed under reduced-motion). The one place `--motion-slow`
  and `--shadow-3` are used: the hero sits on `--color-surface`, `--radius-2`,
  `--shadow-3` — the single lifted object on the page.

### 1.5 — What next (nudge band)

A slim, optional **`HomeNudge`** line directly under the hero (hairline above,
no card) that names the single most useful next step when nothing is already
pressing — the GOAL §6.6 "what next" guidance brought to the front door. The
server (`/api/overview` → `whatNext`) picks exactly one recommendation, in this
priority:

1. undecided words still waiting in triage ("12 words waiting — triage them" →
   `/triage`),
2. else the weakest below-mastery grammar topic, by name ("Your tutor is
   covering the subjunctive — practice it" → that topic's lesson,
   `/grammar/topics/{id}/lesson`),
3. else, when the suggestion pool is non-empty, "N words picked for you" →
   `/suggestions`.

The band is absent entirely when there is nothing to surface, and when a card
is due (the hero's "Start review" is then the obvious next step — the nudge
never duplicates it). It only points: accept = follow the link, a trailing `×`
dismisses it for the session; it never adds a word or enrolls a topic. Full
spec: `components.md` §HomeNudge.

### 2 — Overview grid (entry points)

A responsive grid of **`OverviewCard`**s (new component) — one per area — that
each state their status as a sentence and link in. One column on phone, two at
`bp-tablet`, three at `bp-desktop`. Cards are hairline-ruled, not boxed-in
(`--color-surface`, `--radius-2`, `--shadow-1`, padding `--space-5`).

Cards, in order:

1. **Review** — "23 due · 4 new today" → `/review`.
2. **Quiz** — "Test yourself · def-match, cloze, or mixed" → `/quiz`.
3. **Library** — "412 words · 61 mature" → `/library`.
4. **Grammar** — "8 topics · 3 below 50% mastery" → `/grammar` (or, if the
   curriculum is unseeded, "Seed your curriculum to start lessons" → seed flow,
   closing the discoverability gap from the answered /lesson question).
5. **Ingest** — "Add a PDF or paste text" → `/ingest`.
6. **Suggestions** — shown only when the pool is non-empty: "3 words picked for
   you" → `/suggestions`.

Each `OverviewCard`: title `--font-app` `--text-lg` `--weight-bold` `--color-ink`;
status sentence `--font-app` `--text-sm` `--color-ink-soft` (counts in
`--font-meta`); whole card is the link target (`--hit-target` min), hover lifts
border to `--color-ink-faint` and the title to `--color-accent`. Zero/loading
states reuse ProgressStat conventions (em-dash while loading; `--color-ink-faint`
sentence at zero with an inviting verb — "No words yet — ingest a PDF to begin").

### 3 — Activity band

A quiet recap, `--color-paper-sunken` well (hairline top), padding `--space-6`:

- "Recently" — up to 3 `WordEntry size=compact` rows of the latest decided/added
  words, each linking to its WordDetail.
- Any running or recent ingestion/seed job as a `JobStatus` line (so progress is
  visible from the front door, not only on `/ingest`).
- If both are empty (fresh install): a single `EmptyState` — "Nothing studied
  yet. Ingest your first source." → `/ingest`.

## States

- **Fresh install (no words):** hero is replaced by an `EmptyState` centerpiece
  ("Your dictionary is empty. Add a PDF or paste text to begin." → `/ingest`);
  overview grid still shows Ingest and Grammar (seed) as the live entry points,
  others at their zero state.
- **Loading:** hero headword em-dash per WordEntry `loading`; overview counts
  em-dash; no layout shift (reserve the hero height).
- **Offline/error fetching the summary:** keep the static grid (links still
  work); show an inline `error` Toast, never a blank page.
- **Nothing due, work available:** the What-next nudge appears under the hero
  with one recommendation. **A card is due, or nothing to surface (or loading):**
  the nudge band is absent — no reserved space, no skeleton.

## Notes

- Home reads only; it triggers no LLM calls and writes nothing. It is safe to
  land on, refresh, and leave.
- Counts come from the same summary source the footer uses — one fetch, shared.
