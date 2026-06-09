# Product / Project Goal

<!--
INSTRUCTIONS FOR HUMANS:
Fill in every section before starting the orchestrator. Anything left vague will
be filled by the agent with the most generic plausible answer. The most important
sections for autonomous operation are marked ★.

The orchestrator reads this file on every loop iteration. Part D (§11–13) is what
lets it make decisions without asking you — don't skip it.

Reference: product-project-definition-brief.md for full guidance on each section.
-->

---

## 0 · Meta

- **Name:**
- **Level:** Initiative / Epic / Feature / Task
- **Owner:**
- **Status:** Draft / Approved / In progress / Done
- **Last updated:**

---

## Part A — Strategic Context · *Why this exists*

### 1 · Problem & Opportunity

- **Problem statement:** *(From the user's point of view, not the solution's.)*
- **Why now:**
- **Why us:**

### 2 · Audience & Users

- **Primary persona(s):** *(Who they are, their goal, their current frustration.)*
- **Secondary users & stakeholders:**
- **Anti-personas — who it is NOT for:** *(Critical for preventing scope creep.)*

### ★ 3 · Vision, Goals & Non-Goals

- **One-line vision:**
- **Goals (measurable outcomes):**
  - [ ]
  - [ ]
- **Non-goals (explicitly out of scope):** *(The highest-value section for autonomous work — skip it and the agent expands scope forever.)*
  -
  -

---

## Part B — Product Definition · *What it is*

### 4 · Product Description

- **Elevator pitch:** *(One paragraph a stranger would understand.)*
- **Core capabilities:** *(The handful of things it fundamentally does.)*
- **What it is NOT:** *(Boundaries against adjacent/competing products.)*
- **What it runs on:** *(Platform(s) — web, iOS, CLI, desktop, API, etc.)*

### ★ 5 · User Stories & Acceptance Criteria

<!-- For each story: As a <persona>, I want <capability> so that <outcome>. -->
<!-- Acceptance: Given <context>, when <action>, then <observable result>. -->
<!-- Priority: Must / Should / Could / Won't (MoSCoW) -->

- **[Must]**
- **[Must]**
- **[Should]**
- **[Could]**

### ★ 6 · Functional Requirements

<!-- What the system must *do*, grouped by feature area, specific enough that "done" is unambiguous. -->

#### Feature area 1:
-
-

#### Feature area 2:
-
-

### 7 · Non-Functional Requirements

<!-- Set targets, not adjectives: "p95 under 300ms," not "fast." -->

- **Performance:**
- **Reliability:**
- **Security:**
- **Accessibility:**
- **Observability/logging:**

---

## Part C — Execution Context · *The bounds to build within*

### ★ 8 · Technical Context & Constraints

- **Stack / languages / frameworks:** *(Mandated, preferred, or "agent's choice within `<constraints>`.")*
- **Architecture notes / patterns:** *(Anything that must — or must not — be used.)*
- **Key entities / data model:** *(Core objects and their relationships.)*
- **Integrations & dependencies:** *(APIs, services, auth model.)*
- **Hard constraints:** *(Budget, infra, latency, data residency, offline support.)*

---

## Part D — Autonomy & Quality Framework · *How the agent should think*

<!-- This is what lets the orchestrator run unsupervised. Fill this carefully. -->

### ★ 11 · Decision & Tradeoff Rules

- **Prioritization logic:** *(How to sequence when everything seems important — e.g., riskiest-first, or thinnest end-to-end slice first.)*
- **Tradeoff defaults:**
  - Speed vs. polish:
  - Build vs. reuse:
  - Generality vs. simplicity:
- **Reversible vs. irreversible:** *(Move fast on reversible; pause on one-way doors.)*

### ★ 12 · Quality Bar

- **Acceptable:**
- **Good:**
- **Required hygiene:** *(Tests — what kind and coverage; docs; code style; error handling; security.)*

### ★ 13 · Escalation & Autonomy Boundaries

<!-- The orchestrator checks this before every loop iteration. Be explicit. -->

- **Proceed without asking when:**
  -
  -
- **Stop and ask the human when:**
  - A non-goal would be crossed
  - A one-way-door decision (can't be undone without significant cost)
  -
- **Never do:**
  - Push to production or open PRs without human review
  - Add paid external dependencies
  - Expand scope beyond §3 Non-goals
  -

---

## Part E — Validation · *Are we done, and right?*

### 14 · Success Metrics & KPIs

<!-- 1–3 metrics that prove the goal was met. Tie back to §3 Goals. -->

-
-

### ★ 15 · Definition of Done

<!-- The orchestrator stops its loop when Release Done is met. -->

- **Task done:** Acceptance criteria met, tests pass.
- **Feature done:** All stories shipped, NFRs met, docs updated.
- **Release done:** *(All of the above, plus:)*
  -
  -

### 16 · Risks, Edge Cases & Failure Modes

- **Top risks:**
  - Risk: — Mitigation:
- **Edge cases that must be handled:**
  -
- **Failure modes / graceful degradation:**
  -

### ★ 17 · Assumptions & Open Questions

<!-- Leave open questions visible — the agent should weigh uncertainty, not paper over it. -->

- **Assumptions:**
  -
- **Open questions:**
  -
