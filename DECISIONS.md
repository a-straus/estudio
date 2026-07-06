# Decisions — V2

<!-- Orchestrator's durable memory: one line per resolved decision. V1's
full decision log (178 iterations) is archived at archive/v1/DECISIONS.md;
the distilled, still-binding subset lives in docs/V1-HISTORY.md — read that
before re-litigating anything V1 settled. -->

- 2026-07-06 (owner): **V2 pivot approved** — GOAL.md v3 replaces v2; V1 state files archived to `archive/v1/`; inherited memory distilled to `docs/V1-HISTORY.md`.
- 2026-07-06 (owner): Hosting — prepare for cloud + managed Postgres, but the first pass is polish on the current stack; no infra work in Phase 1.
- 2026-07-06 (owner): Auth — email magic link, invite-gated by the waitlist; no passwords, no OAuth, no auth SaaS.
- 2026-07-06 (owner): Cost model — free beta with per-user quotas; billing is post-beta; no Stripe in V2.
- 2026-07-06 (owner): Beta-user scope — core loop only (PDF/text ingest → triage → review → quiz → grammar → Ask → suggestions → library); lesson audio, voice questions, Gutenberg/book ingestion, and Mochi import remain owner-only behind the owner role.
- 2026-07-06 (owner): V1's KJV ingestion (10/46 chunks; API cap reset 2026-07-01) does not gate V2 — resume as a small owner-only task whenever convenient (GOAL §17.4).
