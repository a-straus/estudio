> Screen spec — read together with `design/tokens.md` and `design/screens/shell.md`; component anatomy is in `design/components.md`.

### 3.9 System

**Purpose.** The machine's honest ledger: spend, jobs, errors, backups. Utilitarian and proud of it.

**Regions.** Single column of hairline-separated sections, all values `--font-meta`:

1. _Spend_ — "LLM spend · $4.12 since May 1 · $0.84 this week"; per-feature breakdown table (definitions / questions / lessons / grading).
2. _Jobs_ — `JobStatus` rows: running (progress + stage), queued, finished (last 10, with durations). Quiet Button "Cancel" on running jobs.
3. _Errors_ — last 20, each: timestamp, what failed, what the app did about it ("retried ×2, gave up — affected 3 words, flagged in Library").
4. _Backup_ — "Last export · yesterday 23:40 · 2.1 MB" + primary-quiet Button "Export backup now"; restore via file picker.
5. _Preferences_ — the owner's few settings as plain rows, one SegmentedControl each: "Definitions on reveal · Spanish / English / Both" (default Both), "New cards per day · 10 / 20 / 40" (default 20).

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
│ BACKUP  yesterday 23:40 · 2.1 MB  [Export]   │
└──────────────────────────────────────────────┘
```

**Responsive.** One column everywhere; tables become stacked label/value pairs below `bp-tablet`.

**States.**

- _Empty:_ "$0.00 · no jobs yet · no errors · never backed up — export one now."
- _Loading:_ sections render skeleton em-dashes independently.
- _Error (the irony case):_ if the System screen itself can't read a section, that section states it plainly: "Job log unreadable. The log file may be corrupt — export a backup first."
- _Overflow:_ error log paginates at 20 ("Older →"); job history capped at 10.

---

