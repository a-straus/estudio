> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.9 System

**Purpose.** The machine's honest ledger: spend, jobs, errors, backups. Utilitarian and proud of it.

**Regions.** Single column of hairline-separated sections, all values `--font-meta`:

1. _Spend_ — "LLM spend · $4.12 since May 1 · $0.84 this week"; per-feature breakdown table (definitions / questions / lessons / grading / chat). Transcription spend is its own line in the same section — a second paid provider, reported separately: "Transcription · $1.20 since May 1 · 3 lessons".
2. _Jobs_ — `JobStatus` rows: running (progress + stage), queued, finished (last 10, with durations). Quiet Button "Cancel" on running jobs.
3. _Errors_ — last 20, each: timestamp, what failed, what the app did about it ("retried ×2, gave up — affected 3 words, flagged in Library").
4. _Backup & export_ — status line: "Last backup · yesterday 23:40 · 12 kept" (or "Never backed up — back one up now"). A primary-quiet Button "Back up now" runs a server-side timestamped DB backup (the existing §6.8 path — same code as the scheduled job). Two further quiet Buttons pull data **off the box**, each triggering a plain browser download: "Export data (JSON)" — a one-click full JSON snapshot of all your data (GOAL §5 Phase-4 "one-click JSON export"; a complete logical dump the owner can keep elsewhere), and "Download latest backup (.db)" — the SQLite backup file itself, trivially copyable (disabled until at least one backup exists). **Restore** stays the documented copy-the-DB-file-back procedure (README "Where your data lives"); an in-app import is intentionally not built — overwriting the live DB is a one-way-door data operation (§13), and the §15 restore requirement is met by the exercised copy procedure.
5. _Preferences_ — the owner's few settings as plain rows, one SegmentedControl each: "Definitions on reveal · Spanish / English / Both" (default Both), "New cards per day · 10 / 20 / 40" (default 20). One more row, a quiet Button rather than a control — "English level · [Calibrate]" — opening the one-time English placement assessment (`screens/placement.md`); once run it reads "English level · ~C1 · 24 words · [Re-calibrate]" with the band/count in `--font-meta`.

```
Desktop (mobile is the same column, narrower)
┌──────────────────────────────────────────────┐
│ System             Today Library Grammar …  │
├──────────────────────────────────────────────┤
│ SPEND   $4.12 since May 1 · $0.84 this week  │
│   definitions $1.90 · questions $1.10 · …    │
│ ─────────────────────────────────────────────│
│ JOBS    ● Moby-Dick extraction  ch 41/135    │
│         ○ queued: workbook scan p.62–80      │
│ ─────────────────────────────────────────────│
│ ERRORS  Jun 8 14:02  define(scrimshaw) ×2 …  │
│ ─────────────────────────────────────────────│
│ BACKUP  last 23:40 · 12 kept  [Back up now]  │
│         [Export data (JSON)]  [Download .db] │
└──────────────────────────────────────────────┘
```

**Responsive.** One column everywhere; tables become stacked label/value pairs below `bp-tablet`.

**States.**

- _Empty:_ "$0.00 · no jobs yet · no errors · never backed up — export one now."
- _Loading:_ sections render skeleton em-dashes independently.
- _Error (the irony case):_ if the System screen itself can't read a section, that section states it plainly: "Job log unreadable. The log file may be corrupt — export a backup first."
- _Overflow:_ error log paginates at 20 ("Older →"); job history capped at 10.

---

