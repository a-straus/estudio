# Product / Project Goal

---

## 0 · Meta

- **Name:** Estudio *(working name — rename before public launch; nothing in code depends on it)*
- **Level:** Initiative (v2 release = the Epic described in this document)
- **Owner:** [OWNER — your name here]
- **Status:** Approved
- **Last updated:** 2026-07-06
- **Revision note:** v3 — **the V2 pivot.** V1 (single-user, owner-only, LAN/Tailscale) shipped and is archived: spec in `archive/v1/GOAL.md`, full state history in `archive/v1/`, and the compact inherited memory every agent should read in `docs/V1-HISTORY.md`. V2 takes the same app to **~1,000 real users off a waitlist**. Owner Q&A of 2026-07-06 (4 answers) sets the frame: (1) first pass is **polish, not re-architecture** — cloud + Postgres is prepared for but comes second; (2) auth is **email magic link**, invite-gated; (3) **free beta with per-user usage caps** — no billing at launch; (4) users get the **core loop only** (ingest → triage → review → quiz → grammar); lesson audio, voice questions, Gutenberg/book ingestion, and Mochi import stay owner-only.

---

## Part A — Strategic Context · *Why this exists*

### 1 · Problem & Opportunity

- **Problem statement:** V1 proved the product on its one user: feed the app the material you're actually studying and it becomes spaced-repetition study material automatically. A waitlist of real would-be users now exists, and the app can't serve them: it has no accounts, assumes one trusted user on a private network, and has the rough edges a builder tolerates but a stranger won't — unstyled error states, blank screens where empty states should be, desktop-first seams on mobile, no onboarding path from "just signed up" to "reviewing my first deck."
- **Why now:** The waitlist is live demand. Every week unserved is momentum lost. The core engine (ingestion pipeline, SM-2 SRS, quiz generation, grammar curriculum) already works — what stands between it and users is polish and a multi-user foundation, both well-understood work.
- **Why us:** The owner is the founding user and the product works for them daily. V2 generalizes a proven personal tool, not a hypothesis.

### 2 · Audience & Users

- **Primary persona(s):** Self-directed adult language learners from the waitlist — people like the owner: intermediate+ students with real study material (workbooks, texts) who want automatic extraction and scheduled review instead of manual flashcard entry. They arrive with zero context, on their phones, and decide in the first session whether the app is serious.
- **Secondary users & stakeholders:** The owner, who remains a daily user AND gets an owner/admin role: the V1 owner-specific features (lesson-recording mining, voice questions, Gutenberg/KJV ingestion, Mochi import) keep working for the owner but are not exposed to beta users.
- **Anti-personas — who it is NOT for:** Anyone who wants passive content or a gamified streak machine. The app demands answers. Also not (yet) for the general public at scale — V2 targets ~1,000 invited beta users, not open signup or growth marketing.

### ★ 3 · Vision, Goals & Non-Goals

- **One-line vision:** Turn the proven personal super-teacher into a polished product a thousand invited learners use daily.
- **Goals (measurable outcomes):**
  - [ ] **Launch-quality UX:** every screen a beta user can reach has designed loading, empty, and error states; the whole core loop feels native-grade in a phone browser (see §15 polish bar).
  - [ ] **Multi-user foundation:** invite-gated magic-link accounts; per-user data isolation proven by tests; per-user usage quotas holding total AI spend under the ceiling (§13).
  - [ ] **Beta adoption:** first invite wave onboarded; ≥50% of invited users complete a review session on ≥3 of their first 7 days without owner hand-holding.
- **Non-goals (explicitly out of scope for V2):**
  - **No billing or payments.** Free beta with quotas; Stripe and plans are post-beta work. Design nothing around billing except the quota system that will later underpin it.
  - **No native mobile app** — the mobile *browser* remains the co-primary surface and must feel excellent; that is the whole point of the polish phase.
  - No open/public signup, no growth mechanics, no SEO/marketing site work beyond a minimal landing + waitlist/invite entry point.
  - No gamification (streak pressure, badges, mascots), no social features, no feeds.
  - No TTS/audio playback (still `TODO-LATER.md`), no translation grading, no new subjects beyond Spanish and English vocabulary.
  - No exposure of owner-only features (lesson audio, voice questions, Gutenberg/book ingestion, Mochi import) to beta users in V2 — they stay behind the owner role, working as they do today.
  - No offline mode.
  - No full WCAG audit — but the accessibility floor rises (§7): real users include people with imperfect eyesight and big thumbs.

---

## Part B — Product Definition · *What it is*

### 4 · Product Description

- **Elevator pitch:** Feed Estudio the Spanish you're actually studying — workbook scans, pasted texts — and it extracts the words you don't know, defines them, schedules them with spaced repetition, quizzes you in both directions, and teaches you the grammar you're missing. Now with accounts: sign in with an email link, your decks are yours, and it works beautifully from your phone.
- **Core capabilities (beta-user surface — the core loop):**
  1. **Ingest** — scanned workbook PDFs and pasted text → extraction of above-level vocabulary with auto-filled definitions → triage (know / learn / skip).
  2. **Review** — SM-2 spaced repetition, both directions, three grades, "I forgot this" override.
  3. **Quiz** — generated MC + cloze quizzes with cached explanations; misses boost SRS priority.
  4. **Grammar** — the AI-built Spanish curriculum: lessons (explanation → examples → quiz), LLM-graded free text, mastery-weighted practice queue.
  5. **Ask** — the page-context-aware chatbot, per-user threads, add-word tool call.
  6. **Suggest** — calibrated individual word/grammar suggestions, never repeated.
  7. **Manage** — full library CRUD, search, decks.
- **Owner-only capabilities (unchanged from V1, gated by role):** lesson-recording ingestion, voice questions, Gutenberg/book ingestion (KJV completion pending), Mochi import.
- **What it is NOT:** Not Duolingo. Not an e-reader, feed, or general Anki replacement. Not (yet) a paid SaaS — but V2 is the step where it becomes *a product* rather than a personal tool.
- **What it runs on:** Phase 1 (polish): unchanged — one Node process, SQLite, owner's machine. Phase 2+: a cloud host with Postgres, deployed for ~1,000 users. Phone and desktop browsers co-primary throughout.

### ★ 5 · User Stories & Acceptance Criteria

**Phasing (owner mandate, 2026-07-06): polish first, foundation second, launch third.**
- **Phase 1 — Polish (the current pass):** launch-quality UX on the existing single-user app. No schema or infra changes beyond what polish itself requires. The owner's bug/suggestion list (arriving via FEEDBACK.md) is Phase 1 work and shares its priority.
- **Phase 2 — Multi-user foundation:** accounts, per-user data, Postgres migration, cloud deploy preparation, quotas and cost controls, security hardening.
- **Phase 3 — Beta launch:** invite waves, onboarding, operations, admin tools.

MoSCoW priorities apply within the initiative. Build in phase order; within any slice, riskiest part first.

#### Phase 1 — Polish

- **[Must · P1] State-complete screens.** As a user, every screen I can reach handles its full lifecycle.
  - *Given* any screen in the core loop, *then* it has: a designed **loading state** (skeleton or spinner per design contract — never a blank flash or layout jump), a designed **empty state** (what this screen is for + the one action that fills it — empty states are the de-facto onboarding), and a designed **error state** (plain-language message, retry where retrying can work, never a raw stack trace, blank pane, or silent failure). *Given* the server is unreachable, *then* the app says so in one consistent, friendly way everywhere.
- **[Must · P1] Mobile feel.** As a phone user, the core loop feels like it was built for my thumb.
  - *Given* review, triage, quiz, grammar, library, and Ask on a real phone browser (iOS Safari and Android Chrome), *then*: all interactive targets ≥44px; no horizontal scroll or viewport jank anywhere; keyboards don't cover inputs; safe-area insets respected; transitions/taps respond <100ms (perceived — optimistic UI where the write is slow); no accidental zoom or text-selection fights during review taps; pull-height and thumb-reach considered on the primary action of every screen.
- **[Must · P1] Error-proof jobs & AI surfaces.** As a user, long-running and AI-driven features degrade gracefully.
  - *Given* an ingestion job, LLM call, or transcription that fails or is rate-limited, *then* the UI shows status honestly (queued / running / partial / failed-retryable), input is never lost, retry is one tap, and cached content keeps review/quiz fully usable while AI is down.
- **[Must · P1] Owner bug list.** Every item the owner files in FEEDBACK.md during Phase 1 is triaged into the backlog with Phase-1 priority — fixed, or explicitly declined with rationale in DECISIONS.md.
- **[Should · P1] Performance sanity.** First meaningful paint of the review screen <2s on a mid-range phone over normal broadband; no interaction blocked >2s without progress UI (V1 rule, now enforced everywhere).

#### Phase 2 — Multi-user foundation

- **[Must · P2] Accounts via email magic link.** As a waitlisted user, I sign in with just my email.
  - *Given* an invited email address, *when* I request a link, *then* I receive a single-use, time-limited magic link that signs me in and establishes a session; *given* an uninvited email, *then* I'm told the app is invite-only and can join the waitlist. No passwords anywhere. Sessions persist across browser restarts; sign-out works; a returning user lands on their own data.
- **[Must · P2] Per-user data isolation.** As a user, my decks, reviews, chats, jobs, and spend are mine alone.
  - *Given* two users, *then* no API route, job, cache, or page can read or write across users — proven by automated tests exercising every resource type with two accounts. The owner's V1 data becomes the owner account's data in the migration.
- **[Must · P2] Postgres migration + cloud deploy readiness.** As the operator, I can run this for 1,000 users.
  - *Given* the migration, *then* all data moves SQLite → Postgres with a verified, reversible procedure (row counts + spot checks; SQLite backup retained); the app runs against Postgres with check.sh green; deployment to the chosen cloud host is documented as a runbook the owner executes (build, env, migrations, TLS, domain). **Note:** the orchestrator's environment cannot deploy to or reach the cloud — workers produce config + runbooks; the owner runs deploys and reports back via FEEDBACK.md.
- **[Must · P2] Quotas & cost controls.** As the operator, spend cannot run away.
  - *Given* any user, *then* per-user daily/monthly AI usage quotas are enforced (defaults owner-configurable in Settings), with a clear in-app message when a quota is hit; *given* total projected monthly spend crossing the global ceiling (§13), *then* AI features degrade to cached content app-wide and the owner is alerted. Per-user and global spend visible on the System/admin page.
- **[Must · P2] Security hardening to "real users" level.** Magic-link tokens single-use + expiring; sessions httpOnly/secure; rate limiting on auth and AI endpoints; secrets server-side only; HTTPS assumed at the proxy; upload size/type limits enforced. (Still no pen-test/WCAG-grade audit — §7.)
- **[Must · P2] Waitlist & invites.** A minimal public landing page with waitlist email capture; an owner-side invite mechanism (invite an email or a batch); invited emails can sign in.

#### Phase 3 — Beta launch

- **[Must · P3] Cold-start onboarding.** As a brand-new user, I get from sign-in to my first review in one sitting.
  - *Given* a fresh account, *then* the empty states walk me through: create/pick a deck → paste a text or upload a PDF (or accept a starter suggestion set) → triage → first review. No tour widgets; the empty states themselves are the onboarding.
- **[Must · P3] Admin surface.** As the owner, I can see users, their activity, per-user spend, error rates, and job health; I can invite, disable, or quota-adjust a user. (Extends the V1 System page.)
- **[Must · P3] Operations.** Error tracking that reaches the owner (server + client errors, aggregated), Postgres backup cadence documented and exercised once, a deploy/rollback runbook proven by at least one real cycle.
- **[Must · P3] Feedback channel.** A lightweight in-app "report a problem / suggest" affordance that lands somewhere the owner reads.
- **[Should · P3] Progress view.** The V1 Phase-4 progress view (counts, due forecast, accuracy trends, grammar mastery) — beta users will ask "is this working?"
- **[Won't (V2)]** Billing, native apps, TTS, open signup, social, new subjects, SMS/email capture inbox (all remain `TODO-LATER.md` or post-beta).

### ★ 6 · Functional Requirements

*(V1's §6 remains the behavioral spec for every core-loop feature — ingestion, triage, SRS, quizzes, grammar, Ask, suggestions, library, LLM/transcription adapter layers, jobs, observability. It is not restated here; see `archive/v1/GOAL.md` §6 and `docs/V1-HISTORY.md`. V2 adds and amends:)*

#### 6.1 · Polish contract (Phase 1)
- The design contract (`design/`) is the authority for what "polished" means; extend it (tokens, components, interaction) as needed so that loading/empty/error states and mobile behaviors are *specified*, not improvised per screen. New shared components (skeletons, empty-state blocks, error banners, toasts) enter `components.md`.
- An explicit **screen state audit** artifact: for every screen, the matrix of states (loading / empty / partial / error / offline) with its status — the audit drives the Phase 1 backlog and gates §15.
- Copy is part of polish: every user-facing string is reviewed for plain, warm, non-technical language (both error copy and empty-state copy). No developer jargon reaches users.

#### 6.2 · Accounts & tenancy (Phase 2)
- `User` (email, role: owner | user, status: invited | active | disabled, created_at), `Session`, `MagicLinkToken` (single-use, expiring), `Invite`/waitlist entries.
- Every user-owned entity (words, decks, sources, card states, review logs, quiz attempts, chat threads, suggestions, jobs, spend records, settings) gains a `user_id`; shared/global content (grammar curriculum, cached lessons/questions where user-independent) is explicitly marked so and stays shared to keep cache economics.
- The V1 database migrates as the owner's account. Owner role additionally unlocks the owner-only features and the admin surface.
- Transactional email (magic links, invites) via one provider behind a thin adapter (same pattern as `LlmProvider`); provider choice is the orchestrator's within §13 spend bounds.

#### 6.3 · Cost & quota layer (Phase 2)
- Per-user usage accounting on every LLM/transcription call (extend the existing `LlmCall` logging with `user_id`).
- Quota policy: owner-configurable defaults (per-user daily AI actions and monthly $-equivalent), enforced server-side, friendly in-app messaging, owner-overridable per user.
- Model routing: user-facing bulk operations (extraction, definitions) default to the cheapest adequate model; the adapter layer already supports per-task model config — use it. Cache-first remains the prime directive: never regenerate what is stored.
- Global kill switch: at the ceiling, AI degrades to cache app-wide rather than overspending.

#### 6.4 · Infrastructure (Phase 2, prepared — not Phase 1)
- Target: one cloud host (provider chosen by orchestrator within §13 bounds, recorded in DECISIONS.md) running the Node app + managed Postgres; uploads/originals move to the host's persistent disk or object storage (choose the simplest thing that survives redeploys).
- Postgres via the same plain-SQL + migration-runner discipline (no ORM). During Phase 1, avoid *new* SQLite-only constructs where a portable equivalent is equal effort.
- The always-on machine remains the owner's dev/staging instance.

### 7 · Non-Functional Requirements

- **Performance:** The §5 P1 targets (paint <2s on mid-range phone; nothing blocks >2s without progress UI). At 1,000 users the load is still small (low-hundreds concurrent at peak, at most); no load-testing theater — but no O(n) queries over another user's data either.
- **Reliability:** The V1 hard rule stands — **no user data loss, ever** — now for a thousand people: Postgres backups with documented, once-exercised restore; jobs survive restarts; append-only ReviewLog remains the recompute-anchor.
- **Security:** Upgraded from "afterthought" to "responsible": the §5 P2 hardening list is the bar. Still no formal audit; every shortcut still gets a DECISIONS.md line.
- **Accessibility:** Floor rises with real users: readable sizes, sane contrast, ≥44px targets, visible focus, labels on inputs, honest button/link semantics. Still no WCAG audit.
- **Observability:** First-class, now operationally: aggregated error visibility that reaches the owner, per-user spend/job visibility in admin, structured logs as in V1.

---

## Part C — Execution Context · *The bounds to build within*

### ★ 8 · Technical Context & Constraints

- **Stack (unchanged unless stated):** React + Vite, plain CSS with design tokens (no Tailwind/CSS-in-JS); Node + Express, REST/JSON; TypeScript strict; plain SQL + tiny migration runner. Database: SQLite today → **Postgres in Phase 2** (better-sqlite3 → pg, same no-ORM discipline). Monorepo layout `/server`, `/web`, `/shared`, `/prompts`, `/docs` stands.
- **Inherited architecture:** `docs/V1-HISTORY.md` is the compact map of what exists (modules, entities, adapters, conventions); `ARCHITECTURE.md` remains the living technical design and evolves through the normal schema gate. V1's adapter seams (`LlmProvider`, `TranscriptionProvider`) are load-bearing; the email provider joins them as a third adapter.
- **New pre-approved paid dependencies (owner, 2026-07-06):** cloud hosting + managed Postgres, and one transactional-email provider — in addition to the LLM and transcription APIs. Combined infra + email budget: **target ≤$50/month at beta scale [OWNER: confirm]**; AI spend governed by §13.
- **Deployment reality:** the orchestrator and its workers run in an isolated environment (no access to cloud consoles or production hosts). All deploy/DNS/TLS/provider-console actions are **owner-executed** from runbooks the workers write; results flow back through FEEDBACK.md.
- **Data:** the live V1 database (`data/app.db`) is real user data (the owner's). It migrates, never resets. Timestamped backup before every migration remains law.

### ★ 11 · Decision & Tradeoff Rules

- **Prioritization logic (owner force-ranked, 2026-07-06):**
  1. **Phase 1 polish** — the screen-state audit, then the audit's findings + the owner's FEEDBACK.md list, ordered by user-visible impact on the daily loop (review, triage, quiz first; library, grammar, Ask next; settings/system last).
  2. **Phase 2 foundation** — accounts → isolation → Postgres migration → quotas → hardening → waitlist/invites (in that order: each depends on the previous).
  3. **Phase 3 launch** — onboarding → admin → ops → feedback channel → progress view.
  Within any slice: riskiest part first.
- **Tradeoff defaults:**
  - Polish vs. new features: **polish wins.** V2 adds almost no new user-facing capability; it makes existing capability excellent.
  - Build vs. reuse: unchanged — hand-rolled core, commodity infrastructure. Auth is small enough to hand-roll on the magic-link model (no auth SaaS); email sending is reused (provider SDK behind the adapter).
  - Generality vs. simplicity: unchanged — simplicity. The only new seams are `user_id`, the email adapter, and the quota layer.
- **Reversible vs. irreversible:** move fast on UI, copy, prompts, quota defaults, model routing. One-way doors (ask first): the Postgres cutover for live data (backup + reversal plan required), anything that emails real users in bulk, deleting/rewriting user data outside CRUD, changing the SRS algorithm now that real review history exists.

### ★ 12 · Quality Bar

- **Acceptable:** Every §5 Must story passes its acceptance criteria on desktop Chrome and one real iOS Safari + one real Android Chrome. No data loss. No unhandled error reaches a user as a blank screen or raw trace.
- **Good:** A stranger onboards without help and comes back the next day; the owner reads the admin page instead of the server logs; a fresh agent orients from README + `docs/V1-HISTORY.md` in one read.
- **Required hygiene:** unchanged from V1 (unit tests on scheduling math, ingestion, dedupe, suggestion uniqueness; route tests happy + failure paths) **plus**: two-account isolation tests on every resource type, magic-link token lifecycle tests, quota enforcement tests, and migration verification scripts. check.sh stays the single gate and stays fast.

### ★ 13 · Escalation & Autonomy Boundaries

- **Proceed without asking:** everything inside §3/§5/§8 — including schema migrations (with backups), design-contract evolution, prompt changes, model/provider routing within ceilings, choosing the cloud host / Postgres flavor / email provider within the pre-approved budget, and all Phase 1 polish decisions.
- **Stop and ask the human when:**
  - A §3 non-goal would be crossed (billing, native app, open signup, gamification…).
  - The Postgres cutover of the live database is ready to execute (present the runbook + reversal plan first).
  - Anything would send email to real users in bulk (invite waves are owner-triggered).
  - Projected **AI spend exceeds $150/month [OWNER: confirm]** or any single operation >$10; projected infra spend exceeds the §8 budget.
  - Any new paid dependency beyond the five pre-approved (LLM, transcription, hosting, Postgres, email).
  - Anything would delete or rewrite user data outside normal CRUD flows.
- **Never do:** commit secrets; ship keys to the browser; add analytics/trackers beyond first-party error tracking; run destructive DB operations without a timestamped backup; expose owner-only features to users; open signup to the public.

---

## Part E — Validation · *Are we done, and right?*

### 14 · Success Metrics & KPIs

- **Polish:** the screen-state audit shows 100% coverage (every reachable screen: loading/empty/error designed and implemented); owner signs off on the mobile feel of the daily loop on their real phone.
- **Foundation:** isolation test suite green; migration rehearsal (copy of live DB → Postgres → verification) clean before the real cutover.
- **Beta:** first wave invited; ≥50% of invited users review on ≥3 of their first 7 days; error tracker quiet enough that the owner isn't firefighting.

### ★ 15 · Definition of Done

- **Phase 1 (Polish) done — the near-term target the orchestrator drives toward first:**
  - Screen-state audit exists, is 100% implemented, and check.sh is green.
  - Every Phase-1 Must story passes on desktop Chrome + one real phone browser.
  - The owner's FEEDBACK.md Phase-1 list is empty (fixed or explicitly declined in DECISIONS.md).
  - Design contract updated to specify the new shared state components.
- **Phase 2 (Foundation) done:** magic-link auth E2E on the deployed stack; two-account isolation suite green; live data migrated to Postgres (backup retained, verification clean); quotas enforced and visible; hardening list done; waitlist + invite mechanism works; deploy runbook proven by one real owner-executed deploy.
- **Release done (V2 / beta launch):** Phases 1–2 plus Phase-3 Musts: onboarding path proven by a fresh test account on a phone; admin surface live; error tracking reaching the owner; backup/restore exercised on Postgres; feedback channel live; first invite wave sent (owner-triggered). *(Then `.release-done`, with the beta-launch summary.)*

### 16 · Risks, Edge Cases & Failure Modes

- **Top risks:**
  - Polish is unbounded. — Mitigation: the screen-state audit turns "polish" into a finite checklist; §15 gates on the checklist, not on vibes.
  - Multi-tenant retrofit misses an isolation hole. — Mitigation: mechanical `user_id` sweep of the schema + the two-account test suite as a standing gate in check.sh.
  - Postgres migration corrupts or drops live data. — Mitigation: rehearse on a copy first; backup before cutover; verification scripts; owner approves execution (§13).
  - AI spend at 1,000 users. — Mitigation: quotas, cheap-model routing, cache-first, global kill switch, spend visibility. (V1's KJV run already demonstrated account-level caps bite — see `docs/V1-HISTORY.md`.)
  - Magic-link email deliverability. — Mitigation: reputable provider, SPF/DKIM in the runbook, resend affordance, owner-side invite status visibility.
  - Beta users hit owner-grade rough edges Phase 1 missed. — Mitigation: in-app feedback channel + error tracking land *before* the first wave (Phase 3 Musts).
- **Edge cases:** magic link opened on a different device than requested; invite sent to an address already signed up; user hits quota mid-ingestion (job pauses resumably, message shown); two users ingest the same public text (caches shared where user-independent, words per-user); disabled user's session revoked; owner data must never be visible to any user.
- **Failure modes / graceful degradation:** unchanged V1 rules (AI down → cache keeps review/quiz alive; jobs resume; DB failures loud) — now per-user and with the global spend kill switch.

### ★ 17 · Assumptions & Open Questions

- **Assumptions:**
  - The waitlist exists and the owner controls it (the app imports/holds emails; no external waitlist tool integration required).
  - ~1,000 users at beta means low-hundreds weekly-active at most; one app node + managed Postgres suffices.
  - The owner will execute deploys and provider-console setup from runbooks (orchestrator cannot reach the cloud).
  - The owner continues to provide the Anthropic + transcription keys; per-user quotas make aggregate spend predictable.
  - V1's owner-only features keep working through the migration but get no V2 polish investment.
- **Open questions:** *(weigh, don't paper over)*
  1. **Spend ceilings** — $150/mo AI + $50/mo infra are placeholders. OWNER: confirm or amend in QUESTIONS.md when the orchestrator asks.
  2. **Product name + domain** — needed before the landing page/invite emails ship (Phase 2/3 boundary). OWNER decision.
  3. **Waitlist source** — where the current waitlist lives and how emails get into the invite system. OWNER to describe when Phase 2 starts.
  4. **KJV completion (owner-only)** — the V1 ingestion sits at 10/46 chunks; the blocking API cap reset 2026-07-01. Resuming it is a small owner-approved task; schedule it whenever convenient — it does not gate V2.

*(Resolved by the owner, 2026-07-06: hosting — prepare for cloud + Postgres, but polish first. Auth — email magic link, invite-gated. Cost — free beta with per-user caps, billing post-beta. User scope — core loop only; lesson audio, voice questions, Gutenberg, Mochi stay owner-only.)*
