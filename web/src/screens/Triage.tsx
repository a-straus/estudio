import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAY_KNOW_THRESHOLD,
  type ConfirmResponse,
  type DedupeHit,
  type ExtractionItemView,
  type TriageDecision,
  type TriageGroup,
} from "@estudio/shared";
import {
  Button,
  EmptyState,
  Toast,
  TriageRow,
  WordEntry,
  type WordEntryData,
} from "../components";
import {
  bulkDecide,
  confirmBatch,
  fetchBatch,
  patchDecision,
  resolveDedupe,
} from "./triageApi";
import "./Triage.css";

interface TriageProps {
  sourceId: number;
}

/** One step the user can undo: the prior decision of each affected item. */
interface UndoStep {
  prior: { id: number; decision: TriageDecision }[];
}

function toWordEntry(item: ExtractionItemView): WordEntryData {
  return {
    headword: item.term,
    lemma: item.lemma ?? undefined,
    language: "ES",
    partOfSpeech: item.partOfSpeech ?? undefined,
    level: item.level ?? undefined,
    glossEs: item.definitionEs ?? undefined,
    glossEn: item.definitionEn ?? undefined,
    example: item.example ?? undefined,
  };
}

function groupOf(item: ExtractionItemView): TriageGroup {
  return item.likelyKnown !== null && item.likelyKnown >= MAY_KNOW_THRESHOLD
    ? "may_know"
    : "probably_new";
}

export function Triage({ sourceId }: TriageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<{ id: number; title: string | null }>();
  const [batchNo, setBatchNo] = useState(1);
  const [batchCount, setBatchCount] = useState(0);
  const [items, setItems] = useState<ExtractionItemView[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<UndoStep[]>([]);
  const [toast, setToast] = useState<{
    text: string;
    variant: "info" | "error";
  } | null>(null);
  const [summary, setSummary] = useState<ConfirmResponse | null>(null);
  const [dedupeHits, setDedupeHits] = useState<DedupeHit[]>([]);
  const [confirming, setConfirming] = useState(false);

  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  const load = useCallback(
    async (which?: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchBatch(sourceId, which);
        setSource(data.source);
        setBatchNo(data.batchNo);
        setBatchCount(data.batchCount);
        setItems(data.items);
        setUndoStack([]);
        setSummary(null);
        setDedupeHits([]);
        const firstPending = data.items.find((i) => i.decision === "pending");
        setCurrentId(firstPending?.id ?? null);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Couldn't load this batch.",
        );
      } finally {
        setLoading(false);
      }
    },
    [sourceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Flow order: probably-new group first, then may-know — the order the
  // raised current row advances through (screen spec 3.5).
  const flow = useMemo(() => {
    const groups: TriageGroup[] = ["probably_new", "may_know"];
    return groups.flatMap((g) => items.filter((it) => groupOf(it) === g));
  }, [items]);

  const tally = useMemo(() => {
    const t = { know: 0, learn: 0, skip: 0, pending: 0 };
    for (const it of items) t[it.decision] += 1;
    return t;
  }, [items]);

  const allDecided = items.length > 0 && tally.pending === 0;
  const nothingToSort =
    !loading &&
    !loadError &&
    (items.length === 0 || items.every((it) => it.decidedAt !== null)) &&
    !summary;

  const applyDecisions = useCallback((updated: ExtractionItemView[]) => {
    setItems((prev) => {
      const byId = new Map(updated.map((u) => [u.id, u]));
      return prev.map((it) => byId.get(it.id) ?? it);
    });
  }, []);

  const advanceFrom = useCallback(
    (decidedId: number) => {
      const idx = flow.findIndex((it) => it.id === decidedId);
      for (let i = idx + 1; i < flow.length; i++) {
        if (flow[i].decision === "pending") {
          setCurrentId(flow[i].id);
          return;
        }
      }
      // No later pending item — fall back to the first remaining pending one.
      const next = flow.find(
        (it) => it.id !== decidedId && it.decision === "pending",
      );
      setCurrentId(next?.id ?? null);
    },
    [flow],
  );

  const decide = useCallback(
    async (item: ExtractionItemView, decision: TriageDecision) => {
      const prior = { id: item.id, decision: item.decision };
      try {
        const updated = await patchDecision(item.id, decision);
        applyDecisions([updated]);
        setUndoStack((s) => [...s, { prior: [prior] }]);
        advanceFrom(item.id);
      } catch (err) {
        setToast({
          text:
            err instanceof Error ? err.message : "Couldn't save that decision.",
          variant: "error",
        });
      }
    },
    [applyDecisions, advanceFrom],
  );

  const bulk = useCallback(
    async (group: TriageGroup, decision: TriageDecision) => {
      const affected = items.filter(
        (it) => it.decidedAt === null && groupOf(it) === group,
      );
      if (affected.length === 0) return;
      const prior = affected.map((it) => ({
        id: it.id,
        decision: it.decision,
      }));
      try {
        const res = await bulkDecide(sourceId, batchNo, group, decision);
        applyDecisions(res.items);
        setUndoStack((s) => [...s, { prior }]);
        // Advance to the next still-pending item anywhere in the flow.
        const next = flow.find(
          (it) =>
            !prior.some((p) => p.id === it.id) && it.decision === "pending",
        );
        setCurrentId(next?.id ?? null);
      } catch (err) {
        setToast({
          text:
            err instanceof Error
              ? err.message
              : "Couldn't apply that to the group.",
          variant: "error",
        });
      }
    },
    [items, sourceId, batchNo, applyDecisions, flow],
  );

  const undo = useCallback(async () => {
    const step = undoStack[undoStack.length - 1];
    if (!step) return;
    try {
      const restored = await Promise.all(
        step.prior.map((p) => patchDecision(p.id, p.decision)),
      );
      applyDecisions(restored);
      setUndoStack((s) => s.slice(0, -1));
      // Put the cursor back on the first item we just un-decided.
      setCurrentId(step.prior[0].id);
    } catch (err) {
      setToast({
        text: err instanceof Error ? err.message : "Couldn't undo.",
        variant: "error",
      });
    }
  }, [undoStack, applyDecisions]);

  const confirm = useCallback(async () => {
    setConfirming(true);
    try {
      const res = await confirmBatch(sourceId, batchNo);
      setSummary(res);
      setDedupeHits(res.dedupeHits);
      setUndoStack([]);
      if (res.dedupeHits.length === 0) {
        setToast({
          text: `Kept ${res.materialized} ${res.materialized === 1 ? "word" : "words"}.`,
          variant: "info",
        });
      }
    } catch (err) {
      setToast({
        text:
          err instanceof Error ? err.message : "Couldn't confirm the batch.",
        variant: "error",
      });
    } finally {
      setConfirming(false);
    }
  }, [sourceId, batchNo]);

  const resolveHit = useCallback(
    async (hit: DedupeHit, resolution: "keep" | "merge") => {
      try {
        await resolveDedupe(hit.item.id, resolution);
        setDedupeHits((hits) => hits.filter((h) => h.item.id !== hit.item.id));
      } catch (err) {
        setToast({
          text:
            err instanceof Error ? err.message : "Couldn't resolve that word.",
          variant: "error",
        });
      }
    },
    [],
  );

  const moveCurrent = useCallback(
    (dir: 1 | -1) => {
      const pending = flow.filter((it) => it.decision === "pending");
      if (pending.length === 0) return;
      const at = pending.findIndex((it) => it.id === currentId);
      const next = pending[(at + dir + pending.length) % pending.length];
      setCurrentId(next.id);
    },
    [flow, currentId],
  );

  // Keyboard map (D5). Active only while sorting (not during dedupe resolution).
  useEffect(() => {
    if (summary) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const current = items.find((it) => it.id === currentId);
      const key = e.key.toLowerCase();
      if (key === "k" && current) {
        void decide(current, "know");
      } else if (key === "l" && current) {
        void decide(current, "learn");
      } else if (key === "s" && current) {
        void decide(current, "skip");
      } else if (key === "u") {
        void undo();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveCurrent(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveCurrent(-1);
      } else if (e.key === "Enter" && allDecided) {
        void confirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    summary,
    items,
    currentId,
    allDecided,
    decide,
    undo,
    moveCurrent,
    confirm,
  ]);

  // Center the raised row when it advances (no-op under reduced motion via CSS).
  useEffect(() => {
    if (currentId === null) return;
    rowRefs.current
      .get(currentId)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentId]);

  if (loading) {
    return (
      <main className="triage">
        <p className="triage__status">Loading…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="triage">
        <EmptyState
          message={`${loadError} Reload, or check System for details.`}
        >
          <Button variant="secondary" onClick={() => void load()}>
            Reload
          </Button>
        </EmptyState>
      </main>
    );
  }

  // Dedupe resolution takes over the footer flow after a confirm that hit dupes.
  if (summary && dedupeHits.length > 0) {
    return (
      <main className="triage">
        <header className="triage__header">
          <h1 className="triage__title">{source?.title ?? "Extraction"}</h1>
          <p className="triage__meta">
            {dedupeHits.length} already in your library · keep or merge each
          </p>
        </header>
        <div className="triage__dedupe-list">
          {dedupeHits.map((hit) => (
            <DedupeCard key={hit.item.id} hit={hit} onResolve={resolveHit} />
          ))}
        </div>
        {toast && (
          <Toast variant={toast.variant} onDismiss={() => setToast(null)}>
            {toast.text}
          </Toast>
        )}
      </main>
    );
  }

  // Confirm finished cleanly (or all dupes resolved) — offer the next batch.
  if (summary && dedupeHits.length === 0) {
    return (
      <main className="triage">
        <EmptyState
          message={`Kept ${summary.materialized} ${summary.materialized === 1 ? "word" : "words"} · ${summary.known} known archived · ${summary.skipped} skipped.`}
        >
          <Button variant="primary" onClick={() => void load()}>
            {batchNo < batchCount ? "Next batch" : "Done"}
          </Button>
        </EmptyState>
        {toast && (
          <Toast variant={toast.variant} onDismiss={() => setToast(null)}>
            {toast.text}
          </Toast>
        )}
      </main>
    );
  }

  if (nothingToSort) {
    return (
      <main className="triage">
        <header className="triage__header">
          <h1 className="triage__title">{source?.title ?? "Extraction"}</h1>
        </header>
        <EmptyState message="Nothing to sort. Ingest something new?" />
      </main>
    );
  }

  const groups: {
    key: TriageGroup;
    label: string;
    bulkLabel: string;
    decision: TriageDecision;
  }[] = [
    {
      key: "probably_new",
      label: "PROBABLY NEW",
      bulkLabel: "Learn all",
      decision: "learn",
    },
    {
      key: "may_know",
      label: "YOU MAY KNOW THESE",
      bulkLabel: "Know all",
      decision: "know",
    },
  ];

  return (
    <main className="triage">
      <header className="triage__header">
        <h1 className="triage__title">{source?.title ?? "Extraction"}</h1>
        <p className="triage__meta">
          Batch {batchNo} of {Math.max(batchCount, batchNo)} ·{" "}
          {tally.know + tally.learn + tally.skip} of {items.length} sorted
        </p>
      </header>

      <div className="triage__groups">
        {groups.map((g) => {
          const groupItems = flow.filter((it) => groupOf(it) === g.key);
          if (groupItems.length === 0) return null;
          const pendingInGroup = groupItems.filter(
            (it) => it.decidedAt === null,
          ).length;
          return (
            <section className="triage__group" key={g.key}>
              <div className="triage__group-header">
                <span className="triage__group-label">
                  {g.label} · {groupItems.length}
                </span>
                {pendingInGroup > 0 && (
                  <Button
                    variant="quiet"
                    className="triage__bulk"
                    onClick={() => void bulk(g.key, g.decision)}
                  >
                    {g.bulkLabel} {pendingInGroup}
                  </Button>
                )}
              </div>
              {groupItems.map((it) => {
                const state =
                  it.decision !== "pending"
                    ? "decided"
                    : it.id === currentId
                      ? "current"
                      : "upcoming";
                return (
                  <div
                    key={it.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(it.id, el);
                      else rowRefs.current.delete(it.id);
                    }}
                  >
                    <TriageRow
                      word={toWordEntry(it)}
                      state={state}
                      decision={
                        it.decision === "pending" ? undefined : it.decision
                      }
                      onKnow={() => void decide(it, "know")}
                      onLearn={() => void decide(it, "learn")}
                      onSkip={() => void decide(it, "skip")}
                    />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <footer className="triage__footer">
        <span className="triage__tally">
          Know {tally.know} · Learn {tally.learn} · Skip {tally.skip}
        </span>
        <div className="triage__footer-actions">
          {undoStack.length > 0 && (
            <Button variant="quiet" onClick={() => void undo()}>
              Undo
              <span className="triage__key-hint" aria-hidden="true">
                U
              </span>
            </Button>
          )}
          {allDecided && (
            <Button
              variant="primary"
              busy={confirming}
              busyLabel="Keeping…"
              onClick={() => void confirm()}
            >
              Keep {tally.know + tally.learn}{" "}
              {tally.know + tally.learn === 1 ? "word" : "words"}
            </Button>
          )}
        </div>
      </footer>

      {toast && (
        <Toast
          variant={toast.variant}
          action={
            toast.variant === "info" && undoStack.length > 0
              ? { label: "Undo", onClick: () => void undo() }
              : undefined
          }
          onDismiss={() => setToast(null)}
        >
          {toast.text}
        </Toast>
      )}
    </main>
  );
}

interface DedupeCardProps {
  hit: DedupeHit;
  onResolve: (hit: DedupeHit, resolution: "keep" | "merge") => void;
}

function DedupeCard({ hit, onResolve }: DedupeCardProps) {
  return (
    <div className="triage__dedupe">
      <WordEntry
        size="full"
        headword={hit.item.term}
        lemma={hit.item.lemma ?? undefined}
        language="ES"
        partOfSpeech={hit.item.partOfSpeech ?? undefined}
        level={hit.item.level ?? undefined}
        glossEs={hit.item.definitionEs ?? undefined}
        glossEn={hit.item.definitionEn ?? undefined}
        example={hit.item.example ?? undefined}
      />
      <p className="triage__dedupe-note">
        Already in your library: <em>{hit.existingWord.term}</em>
        {hit.existingWord.definitionEn
          ? ` — ${hit.existingWord.definitionEn}`
          : ""}
      </p>
      <div className="triage__dedupe-actions">
        <Button variant="secondary" onClick={() => onResolve(hit, "merge")}>
          Merge
        </Button>
        <Button variant="primary" onClick={() => onResolve(hit, "keep")}>
          Keep both
        </Button>
      </div>
    </div>
  );
}
