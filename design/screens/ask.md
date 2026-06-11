> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.11 Ask

**Purpose.** A chat that already knows what you're looking at. Opened from the plain "Ask" button in the chrome (see shell.md — never a floating bubble); threads persist, the assistant can act with your confirmation, and voice questions land here too.

**Regions.**

1. _Thread view_ (the default when opened from a page) — reading column, max `--measure-reading`. A new thread is seeded with the page context, shown as one `--font-meta` `--text-xs` context line at the top ("ASKING ABOUT · _vergüenza_ · review card"), not as a fake first message. Below it, `ChatTurn`s separated by `--space-5` — no bubbles, hairlines only between days. Tool actions render as `ToolConfirm` blocks inline (anatomy in components.md).
2. _Composer_ — fixed in the thumb zone on mobile: multiline TextInput (1 line, auto-grow to 6), primary Button "Send", and the `RecordButton` for voice questions. While a recording is transcribing, the composer shows it as a pending turn ("Transcribing your question…" `--font-meta`) — the thread answers it like any typed turn once the text arrives.
3. _Thread list_ — reached by "Threads" (quiet Button in the session bar): hairline rows, each with the thread's seeded context or first question (`--font-app` `--text-base`, ellipsized), last-activity date in `--font-meta`. Opening Ask from a page starts a new thread seeded with that page; opening from the thread list resumes.

```
Mobile — thread                     Desktop (680px column)
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│ ← Ask          Threads   │       │ Ask · vergüenza        Threads       │
│ ASKING ABOUT · vergüenza │       ├──────────────────────────────────────┤
│                          │       │ ASKING ABOUT · vergüenza · review    │
│ you  Why is it reflexive │       │                                      │
│      in this sentence?   │       │ you   How would a native actually    │
│                          │       │       say this?                      │
│ Because *avergonzarse*…  │       │                                      │
│    Me avergüenzo de…     │       │ Most speakers would say…             │
│ ┌──────────────────────┐ │       │    Me da vergüenza admitirlo.        │
│ │ Add *avergonzarse*   │ │       │                                      │
│ │ to Spanish deck?     │ │       │ ┌ Add *avergonzarse* to deck? ────┐  │
│ │ [ Add ]  Skip        │ │       │ │ [ Add ]  Skip                   │  │
│ └──────────────────────┘ │       │ └─────────────────────────────────┘  │
│ [input…]      ● 🎙 Send  │       │ [input…]                  🎙  Send   │
└──────────────────────────┘       └──────────────────────────────────────┘
```

**Responsive.** Full-screen takeover with the session bar pattern on mobile (back `×` left, "Threads" right); at `bp-tablet`+ a normal page at `--measure-reading`.

**States.**

- _Empty (thread list, first run):_ EmptyState — "No conversations yet. Ask from any page and it starts here."
- _Streaming:_ assistant turn streams in as text arrives; composer stays enabled (queueing a follow-up is fine). No typing-dots theater — the first token is the indicator.
- _Tool call:_ mutation tools always pause on a `ToolConfirm` ("Add _avergonzarse_ to the Spanish deck?" → primary "Add", quiet "Skip"); confirmed actions collapse to a `--font-meta` receipt line ("ADDED · _avergonzarse_ · Spanish deck") with an info Toast. Read-only tools (lookup, page context) run silently.
- _Error:_ a failed turn renders in place: "The answer didn't arrive. Send again." with quiet "Retry" — the thread and your text survive.
- _Recording:_ RecordButton states per components.md; recordings cap at 2 min with the timer counting down the last 15 s.
- _Overflow:_ threads are long-lived by design; older turns lazy-load upward ("Earlier →" at top). Thread list paginates at 20.

---
