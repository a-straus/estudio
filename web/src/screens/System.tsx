import { useCallback, useEffect, useState } from "react";
import type {
  AppSettings,
  DefinitionDisplay,
  JobView,
  NewCardsPerDay,
  PutSettingsRequest,
  SystemErrorView,
  SystemSpendResponse,
  SystemStatusResponse,
} from "@estudio/shared";
import { Button, SegmentedControl, Toast } from "../components";
import {
  fetchErrors,
  fetchJobs,
  fetchSpend,
  fetchStatus,
  getSettings,
  putSettings,
  triggerBackup,
} from "./systemApi";
import "./System.css";

/** Last 20 errors render at once; older ones reveal behind "Older →" (§3.9). */
const ERRORS_PAGE = 20;

const DEFINITION_OPTIONS = [
  { value: "es", label: "Spanish" },
  { value: "en", label: "English" },
  { value: "both", label: "Both" },
];

const CARDS_OPTIONS = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "40", label: "40" },
];

/** Per-section async state: undefined = loading, Error = the "irony case". */
type Section<T> = T | Error | undefined;

function isError(s: Section<unknown>): s is Error {
  return s instanceof Error;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** ISO-8601 UTC → compact "Jun 8 14:02" in the machine voice. */
function shortTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}

/** A small-caps mono section heading + its body. */
function SectionShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="system__section" aria-label={label}>
      <h2 className="system__section-label">{label}</h2>
      <div className="system__section-body">{children}</div>
    </section>
  );
}

function SpendSection({ spend }: { spend: Section<SystemSpendResponse> }) {
  if (spend === undefined) return <p className="system__loading">— · —</p>;
  if (isError(spend))
    return (
      <p className="system__unreadable">
        Spend log unreadable. {spend.message}
      </p>
    );
  return (
    <>
      <p className="system__line">
        LLM spend · {usd(spend.totalCostUsd)} · {spend.callCount}{" "}
        {spend.callCount === 1 ? "call" : "calls"}
      </p>
      {spend.byTask.length === 0 ? (
        <p className="system__muted">No LLM calls yet.</p>
      ) : (
        <ul className="system__rows">
          {spend.byTask.map((t) => (
            <li key={t.task} className="system__row">
              <span className="system__row-name">{t.task}</span>
              <span className="system__row-meta">
                {usd(t.costUsd)} · {t.callCount}×
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function JobsSection({ jobs }: { jobs: Section<JobView[]> }) {
  if (jobs === undefined) return <p className="system__loading">—</p>;
  if (isError(jobs))
    return (
      <p className="system__unreadable">
        Job log unreadable. The log may be corrupt — export a backup first.
      </p>
    );
  if (jobs.length === 0) return <p className="system__muted">No jobs yet.</p>;
  return (
    <ul className="system__rows">
      {jobs.map((j) => (
        <li key={j.id} className="system__row">
          <span className="system__row-name">
            <span
              className={`system__dot system__dot--${j.status}`}
              aria-hidden="true"
            />
            {j.type}
          </span>
          <span className="system__row-meta">
            {j.status}
            {j.attempts > 1 ? ` · ×${j.attempts}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ErrorsSection({ errors }: { errors: Section<SystemErrorView[]> }) {
  const [showAll, setShowAll] = useState(false);
  if (errors === undefined) return <p className="system__loading">—</p>;
  if (isError(errors))
    return (
      <p className="system__unreadable">
        Error log unreadable. The log file may be corrupt — export a backup
        first.
      </p>
    );
  if (errors.length === 0) return <p className="system__muted">No errors.</p>;
  const shown = showAll ? errors : errors.slice(0, ERRORS_PAGE);
  const hidden = errors.length - shown.length;
  return (
    <>
      <ul className="system__rows">
        {shown.map((e, i) => (
          <li key={i} className="system__row system__row--stacked">
            <span className="system__row-meta">
              {shortTs(e.ts)} · {e.scope}
            </span>
            <span className="system__row-name">{e.message}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Button variant="quiet" onClick={() => setShowAll(true)}>
          Older → ({hidden} more)
        </Button>
      )}
    </>
  );
}

function PreferencesSection({
  settings,
  onDefinitionDisplay,
  onNewCardsPerDay,
}: {
  settings: Section<AppSettings>;
  onDefinitionDisplay: (v: DefinitionDisplay) => void;
  onNewCardsPerDay: (v: NewCardsPerDay) => void;
}) {
  if (settings === undefined) return <p className="system__loading">—</p>;
  if (isError(settings))
    return (
      <p className="system__unreadable">
        Preferences unreadable. {settings.message}
      </p>
    );
  return (
    <div className="system__prefs">
      <div className="system__pref">
        <span className="system__pref-label">Definitions on reveal</span>
        <SegmentedControl
          label="Definitions on reveal"
          options={DEFINITION_OPTIONS}
          value={settings.definitionDisplay}
          onChange={(v) => onDefinitionDisplay(v as DefinitionDisplay)}
        />
      </div>
      <div className="system__pref">
        <span className="system__pref-label">New cards per day</span>
        <SegmentedControl
          label="New cards per day"
          options={CARDS_OPTIONS}
          value={String(settings.newCardsPerDay)}
          onChange={(v) => onNewCardsPerDay(Number(v) as NewCardsPerDay)}
        />
      </div>
    </div>
  );
}

function BackupSection({
  status,
  onBackup,
  backingUp,
  backupError,
}: {
  status: Section<SystemStatusResponse>;
  onBackup: () => void;
  backingUp: boolean;
  backupError: string | null;
}) {
  if (status === undefined) return <p className="system__loading">—</p>;
  if (isError(status))
    return (
      <p className="system__unreadable">
        DB status unreadable. {status.message}
      </p>
    );
  const { db, backup } = status;
  return (
    <>
      <p className="system__line">
        DB · {bytes(db.fileSizeBytes)} · {db.walMode ? "WAL" : "rollback"}
      </p>
      <p className="system__muted system__path">{db.path}</p>
      <p className="system__line">
        {backup.latestFilename
          ? `Last backup · ${shortTs(backup.latestTs!)} · ${backup.count} kept`
          : "Never backed up — export one now."}
      </p>
      <Button
        variant="secondary"
        busy={backingUp}
        busyLabel="Backing up…"
        onClick={onBackup}
      >
        Export backup now
      </Button>
      {backupError && <p className="system__unreadable">{backupError}</p>}
    </>
  );
}

/**
 * System — the machine's honest ledger: spend, jobs, errors, backups. Each
 * section loads and fails independently; a section that can't read its slice
 * says so plainly rather than blanking the whole page.
 */
export function System() {
  const [spend, setSpend] = useState<Section<SystemSpendResponse>>(undefined);
  const [jobs, setJobs] = useState<Section<JobView[]>>(undefined);
  const [errors, setErrors] = useState<Section<SystemErrorView[]>>(undefined);
  const [status, setStatus] =
    useState<Section<SystemStatusResponse>>(undefined);
  const [settings, setSettings] = useState<Section<AppSettings>>(undefined);

  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  const asError = (err: unknown): Error =>
    err instanceof Error ? err : new Error("Couldn't read this section.");

  const loadStatus = useCallback(() => {
    fetchStatus().then(setStatus, (err) => setStatus(asError(err)));
  }, []);

  const load = useCallback(() => {
    fetchSpend().then(setSpend, (err) => setSpend(asError(err)));
    fetchJobs().then(
      (r) => setJobs(r.jobs),
      (err) => setJobs(asError(err)),
    );
    fetchErrors().then(
      (r) => setErrors(r.errors),
      (err) => setErrors(asError(err)),
    );
    getSettings().then(
      (r) => setSettings(r.settings),
      (err) => setSettings(asError(err)),
    );
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const onBackup = useCallback(() => {
    setBackingUp(true);
    setBackupError(null);
    triggerBackup()
      .then(() => loadStatus())
      .catch((err: unknown) =>
        setBackupError(
          err instanceof Error ? err.message : "Backup failed. Try again.",
        ),
      )
      .finally(() => setBackingUp(false));
  }, [loadStatus]);

  // Optimistically reflect the new value; on failure, surface it and re-read
  // the server's truth so the control snaps back.
  const saveSettings = useCallback((patch: PutSettingsRequest) => {
    setPrefError(null);
    setSettings((prev) =>
      prev && !isError(prev) ? { ...prev, ...patch } : prev,
    );
    putSettings(patch)
      .then((r) => setSettings(r.settings))
      .catch((err: unknown) => {
        setPrefError(
          err instanceof Error ? err.message : "Couldn't save that preference.",
        );
        getSettings().then(
          (r) => setSettings(r.settings),
          () => {
            /* leave the optimistic value; the error toast already shows */
          },
        );
      });
  }, []);

  return (
    <main className="system">
      <h1 className="system__title">System</h1>

      {/* Nit #5: no spend time-window toggle here — /api/system/spend returns
          all-time totals only and exposes no per-call timestamps. Windowing
          would require changing the spend SQL/schema, which is out of scope. */}
      <SectionShell label="SPEND">
        <SpendSection spend={spend} />
      </SectionShell>

      <SectionShell label="JOBS">
        <JobsSection jobs={jobs} />
      </SectionShell>

      <SectionShell label="ERRORS">
        <ErrorsSection errors={errors} />
      </SectionShell>

      <SectionShell label="BACKUP">
        <BackupSection
          status={status}
          onBackup={onBackup}
          backingUp={backingUp}
          backupError={backupError}
        />
      </SectionShell>

      <SectionShell label="PREFERENCES">
        <PreferencesSection
          settings={settings}
          onDefinitionDisplay={(v) => saveSettings({ definitionDisplay: v })}
          onNewCardsPerDay={(v) => saveSettings({ newCardsPerDay: v })}
        />
      </SectionShell>

      {prefError && (
        <Toast variant="error" onDismiss={() => setPrefError(null)}>
          {prefError}
        </Toast>
      )}
    </main>
  );
}
