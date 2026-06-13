# Estudio

Estudio is a single-user Spanish/English vocabulary and grammar study web app.
You feed it material (a workbook PDF, pasted text), it extracts candidate words,
you triage them into a deck, and it drills you with spaced-repetition reviews,
quizzes, and LLM-authored grammar lessons. It runs as **one Node process** that
serves both the JSON API and the built web app, so desktop and phone hit the
same URL.

**Stack:** TypeScript monorepo (npm workspaces).

- `server/` — Express 5 API + better-sqlite3 (SQLite), background job queue, LLM
  adapter layer. Serves the built web app in production.
- `web/` — React 19 + Vite single-page app.
- `shared/` — API request/response types shared by server and web.
- `prompts/` — versioned LLM prompt templates (one file per task).

---

## Setup & run

Requires **Node ≥ 20**.

```bash
# 1. Clone, then install all workspaces from the repo root
npm install

# 2. Create your .env (git-ignored — never committed)
cp .env.example .env
#    then edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Build everything (shared → server → web)
npm run build

# 4. Start the single process that serves API + web
NODE_ENV=production PORT=3000 npm start
```

Then open **http://localhost:3000**.

### .env

`.env` is read once at boot by `server/src/config.ts` (via `dotenv`). It is
listed in `.gitignore` and must never be committed.

| Variable            | Default       | Purpose                                                                 |
| ------------------- | ------------- | ----------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | _(unset)_     | Anthropic API key. Required for any LLM work (ingestion, quizzes, lessons). Server-side only — never reaches the browser. |
| `DATA_DIR`          | `./data`      | Where the SQLite DB, backups, and uploads live (see below).             |
| `PORT`              | `3000`        | HTTP port for the combined API + web server.                            |
| `NODE_ENV`          | `development` | Set to `production` so the server serves the built web app from `web/dist`. |

> **Why `NODE_ENV=production` to run the app:** the server only mounts the
> static web bundle when `NODE_ENV === "production"`
> (`server/src/app.ts`). In development the React app is served separately by
> Vite (`npm run dev`), which proxies `/api` to port 3000 — convenient for
> live-reload coding, but the desktop/phone "open one URL" experience comes
> from the production build above. You can also put `NODE_ENV=production` in
> `.env` instead of passing it inline.

### Develop with live reload (optional)

```bash
npm run dev   # builds shared+server, starts the API, runs Vite for web/
```

Vite serves the UI on its own port and proxies `/api` to the server on 3000.

---

## Phone access

Phone and desktop are co-primary surfaces. Run the **production** server
(above) so a single URL serves everything, then reach it one of two ways.

### Over your LAN (same Wi-Fi)

1. Find the host machine's LAN IP:
   - **macOS:** `ipconfig getifaddr en0`
   - **Linux:** `hostname -I` (take the first address)
   - **Windows:** `ipconfig` → "IPv4 Address"
2. On the phone's browser (same Wi-Fi), open:

   ```
   http://<that-ip>:3000
   ```

   e.g. `http://192.168.1.42:3000`. The server listens on all interfaces, so no
   extra flag is needed.

### Over Tailscale (works anywhere, free personal tier)

Use this when the phone isn't on the same Wi-Fi.

1. Install Tailscale on the host and sign in (free personal tier):
   `https://tailscale.com/download`.
2. Install the Tailscale app on the phone and sign in with the same account.
3. Get the host's Tailscale IP (`100.x.y.z`) with `tailscale ip -4`, or use its
   MagicDNS name (the device name shown in the Tailscale admin console).
4. On the phone, open:

   ```
   http://<tailscale-ip>:3000
   ```

   e.g. `http://100.101.102.103:3000`, or `http://<host-name>:3000` with
   MagicDNS.

> This keeps the server private to your tailnet — it is **not** exposed to the
> public internet. Do not port-forward this app to the open internet.

---

## Where your data lives

Everything persistent lives under the **data directory**, configured by
`DATA_DIR` in `.env` (default `./data`, resolved relative to where you start the
server). `server/src/config.ts` reads it; `server/src/db/db.ts` creates it on
boot if missing.

```
<DATA_DIR>/
├── app.db              SQLite database (WAL mode)
├── app.db-wal          WAL sidecar (present while the DB is open)
├── app.db-shm          shared-memory sidecar
├── backups/            timestamped DB snapshots, named app-<ISO-timestamp>.db
└── uploads/            original uploaded PDFs, named <ISO-timestamp>-<filename>.pdf
```

- **`app.db`** — the one SQLite database (words, decks, SRS state, sources,
  jobs, grammar topics/lessons, quizzes, `llm_call` spend log, settings). Opened
  in WAL mode, so you will also see `app.db-wal` / `app.db-shm` sidecars while
  the server is running.
- **`backups/`** — timestamped copies of `app.db`, produced by two paths
  (`server/src/jobs/backup.ts`, `server/src/db/migrate.ts`):
  - a **daily backup job** — enqueued on boot if none ran in the last 24h, then
    every 24h. Uses better-sqlite3's online backup (safe while the DB is in use)
    and **keeps the most recent 14**, pruning older ones.
  - a **pre-migration backup** — taken automatically (via `VACUUM INTO`) right
    before any pending schema migration runs, so a migration can never lose
    data.
  - You can also trigger one on demand from the **System** screen ("Export
    backup now").
- **`uploads/`** — the raw PDF originals you upload, kept verbatim. The path of
  each is recorded on its `source` row (`stored_path`). Pasted-text sources
  store their content in the DB (`source.transcript`), not as a file.

No application data lives outside `DATA_DIR`. To move or back up the whole app
state, copy the directory.

---

## Backup & restore

Backups are automatic (daily + pre-migration, see above). To **restore** the DB
from a backup:

1. **Stop the server** (Ctrl-C). SQLite must not be open during the swap.
2. **Copy the chosen backup over the live DB:**

   ```bash
   cp "<DATA_DIR>/backups/app-<timestamp>.db" "<DATA_DIR>/app.db"
   ```

3. **Remove the stale WAL sidecars** so SQLite doesn't replay newer changes over
   your restored file:

   ```bash
   rm -f "<DATA_DIR>/app.db-wal" "<DATA_DIR>/app.db-shm"
   ```

4. **Restart the server.** It reopens `app.db` and runs any pending migrations
   (taking a fresh pre-migration backup first).

### Restore exercised

Exercised for real on **2026-06-11** against a scratch `DATA_DIR` (a temp dir,
so no dev data was touched), using the app's own built code
(`server/dist/jobs/backup.ts` `runBackup` + `server/dist/db/db.ts` `openDb`):

1. Migrated a fresh DB and inserted a known row `setting('restore.demo',
   'original')`.
2. Ran `runBackup(db, dataDir)` → produced `backups/app-2026-06-11T22-00-03Z.db`
   containing that row.
3. **After** the backup, inserted a second row
   `setting('restore.added_after_backup', 'should-disappear')`. Query confirmed
   both rows present.
4. Closed the DB, copied the backup file over `app.db`, deleted `app.db-wal` /
   `app.db-shm`, and reopened.
5. **Result:** the post-backup row was **gone** and the pre-backup row
   **remained** — exactly what a restore should do:

   ```
   after mutation, rows: [ restore.demo=original, restore.added_after_backup=should-disappear ]
   after restore,  rows: [ restore.demo=original ]
   RESULT: post-backup row gone = true | pre-backup row kept = true
   ```

The scratch directory was deleted afterward.

---

## Hot-swap proof

The LLM layer (`server/src/llm/`) is adapter-based with **per-task** model
config. `LlmService.resolveTaskConfig(task)` (in `server/src/llm/service.ts`)
resolves the provider/model for each task with this precedence:

1. the `setting` row `llm.<task>` (JSON `{provider?, model?}`) — settable at
   runtime, no restart;
2. else the env vars `LLM_<TASK>_PROVIDER` / `LLM_<TASK>_MODEL`;
3. else the built-in per-task default (the quality-critical tasks default to
   `claude-opus-4-8`; `quiz_grading` / `suggestion_select` to `claude-sonnet-4-6`,
   `chat` to `claude-haiku-4-5` — see the `TASK_DEFAULTS` table in
   `server/src/llm/service.ts`).

   > **FABLE-DISABLED (2026-06-13):** the quality-critical tasks previously
   > defaulted to `claude-fable-5`, which Anthropic disabled (U.S. government
   > directive); they now use `claude-opus-4-8`, the strongest model still
   > available. Reverting is one constant in `service.ts` — see `DECISIONS.md`.

Models are never hardcoded at call sites, so switching the active model for a
task is a **config-only** change — no code edits.

**The knob used:** the env var `LLM_<TASK>_MODEL`, e.g. `LLM_QUIZ_CLOZE_MODEL`.

**What I did:** with zero code changes, ran the built
`LlmService.resolveTaskConfig("quiz_cloze")` against a scratch DB, first with no
override and then with the env var set:

```
--- default ---
quiz_cloze -> anthropic / claude-opus-4-8

--- env LLM_QUIZ_CLOZE_MODEL=claude-sonnet-4-6 ---
quiz_cloze -> anthropic / claude-sonnet-4-6
```

**Observed result:** the effective model for the `quiz_cloze` task changed from
its built-in default (`claude-opus-4-8`) to `claude-sonnet-4-6` purely from the
environment — no source edits. The env override was set only for that one
command; no config change was committed, so nothing needed reverting in the
repo. (The runtime equivalent is writing the `setting` row `llm.quiz_cloze` from
the System screen, which takes effect without a restart.)

---

## Module map

A one-screen orientation for a fresh agent.

### server/src

- `index.ts` — boot: open DB, run migrations, wire the job queue + handlers +
  LLM service, enqueue the boot/daily backup, start Express.
- `config.ts` — typed config from `.env` (`DATA_DIR`, `PORT`, `NODE_ENV`,
  `ANTHROPIC_API_KEY`).
- `app.ts` — Express app: JSON, request logging, route registration, `/api`
  404, static web serving (production), error handler.
- **`routes/`** — HTTP layer (one file + test each):
  - `sources.ts` — upload PDF / paste text → create a source + enqueue ingestion.
  - `triage.ts` — fetch/triage extracted-word batches (know / learn / undo).
  - `words.ts` — the word library (search, edit, delete, reset card).
  - `srs.ts` — the due-review queue and review grading.
  - `quiz.ts` — generate a quiz, grade answers (a miss pulls the card due now),
    serve cached explanations.
  - `grammar.ts` — curriculum + topics + lesson generation/read.
  - `system.ts` — spend, jobs, errors, and on-demand backup.
- **`jobs/`** — background queue + handlers: `queue.ts` (persistent,
  retrying SQLite-backed queue), `pdfIngestion.ts`, `textIngestion.ts`,
  `quizGen.ts`, `lessonGen.ts`, `grammarSeed.ts`, `backup.ts`, `handlers.ts`.
- **`llm/`** — adapter layer: `service.ts` (task→provider/model resolution,
  retry/backoff, `llm_call` logging), `anthropic.ts` (the Anthropic provider),
  `prompts.ts` (loads + version-hashes templates from `prompts/`), `types.ts`.
- **`db/`** — `db.ts` (open/WAL), `migrate.ts` (numbered SQL migrations with
  pre-migration backup), `migrations/*.sql`, and the per-domain `*-queries.ts`.
- **`srs/`** — `sm2.ts` (the SM-2 scheduling math, incl. the "forgot" demotion)
  and `queue.ts` (due-queue assembly).
- **`pdf/`** — `pages.ts` (page count + per-page PDF extraction via pdf-lib).
- `logger.ts` — structured logger that also persists errors to the DB.

### web/src

- `App.tsx` — minimal path-based routing (see Routes below).
- **`screens/`** — `Ingest`, `Triage`, `Review`, `Quiz`, `Grammar`, `Lesson`,
  `Library`, `System`, each with a co-located `*Api.ts` client and tests.
- **`components/`** — shared UI (Button, ReviewCard, TriageRow, QuizOption,
  WordDetail, JobStatus, Toast, etc.).
- **`styles/`** — `tokens.css` (design tokens) + `base.css`.

### shared/src

- `types.ts` + per-domain `*-api.ts` — request/response contracts used by both
  server and web. `normalize.ts` — shared word-normalization helper.

### prompts/

One markdown template per LLM task: `pdf_extraction`, `page_classification`,
`text_extraction`, `word_definition`, `grammar_curriculum`, `grammar_lesson`,
`quiz_cloze`, `quiz_grading`. Loaded and version-hashed at call time by
`server/src/llm/prompts.ts`.

### Routes (web)

| Path                            | Screen  |
| ------------------------------- | ------- |
| `/ingest`                       | Ingest  |
| `/triage?source=<id>`           | Triage  |
| `/review?deck=<id>` (deck 1 = Spanish) | Review  |
| `/quiz`                         | Quiz    |
| `/grammar`                      | Grammar |
| `/grammar/topics/<id>/lesson`   | Lesson  |
| `/library`                      | Library |
| `/system`                       | System  |

See [demo.md](./demo.md) for a 5-minute click-by-click walkthrough.
</content>
