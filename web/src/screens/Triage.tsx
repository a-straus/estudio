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
  ApiError,
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

// Flow order: probably-new group first, then may-know — the order the raised
// current row advances through (screen spec 3.5). The cursor, the display, and
// the advance logic all walk this single order so they never disagree.
export function flowOrder(
  items: ExtractionItemView[],
): ExtractionItemView[] {
  const groups: TriageGroup[] = ["probably_new", "may_know"];
  return groups.flatMap((g) => items.filter((it) => groupOf(it) === g));
}

// The next word the cursor should land on after `decidedId` is decided.
// `items` MUST already reflect that decision — we walk forward to the next
// still-pending word in flow order, then wrap to the earliest remaining one.
// Pass decidedId = null to pick the first pending word (initial seed).
// Returns null when nothing is left to decide.
export function nextPendingId(
  items: ExtractionItemView[],
  decidedId: number | null,
): number | null {
  const flow = flowOrder(items);
  const idx =
    decidedId === null ? -1 : flow.findIndex((it) => it.id === decidedId);
  for (let i = idx + 1; i < flow.length; i++) {
    if (flow[i].decision === "pending") return flow[i].id;
  }
  // No later pending word — wrap to the earliest one still awaiting a decision.
  for (const it of flow) {
    if (it.id !== decidedId && it.decision === "pending") return it.id;
  }
  return null;
}

export function Triage({ sourceId }: TriageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
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
  // Always-current snapshot of `items`, updated synchronously by every decision
  // path. The cursor advance reads this (not the render-time `flow` closure) so
  // a just-applied decision is visible immediately — even when the user decides
  // faster than React can re-render.
  const itemsRef = useRef<ExtractionItemView[]>([]);

  const load = useCallback(
    async (which?: number) => {
      setLoading(true);
      setLoadError(null);
      setLoadErrorCode(null);
      try {
        const data = await fetchBatch(sourceId, which);
        setSource(data.source);
        setBatchNo(data.batchNo);
        setBatchCount(data.batchCount);
        itemsRef.current = data.items;
        setItems(data.items);
        setUndoStack([]);
        setSummary(null);
        setDedupeHits([]);
        // Seed the cursor on the first pending word in flow order (not server
        // order) so it matches what the user sees at the top of the list.
        setCurrentId(nextPendingId(data.items, null));
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Couldn't load this batch.",
        );
        setLoadErrorCode(err instanceof ApiError ? err.code : null);
      } finally {
        setLoading(false);
      }
    },
    [sourceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const flow = useMemo(() => flowOrder(items), [items]);

  const tally = useMemo(() => {
    const t = { know: 0, learn: 0, skip: 0, pending: 0 };
    for (const it of items) t[it.decision] += 1;
    return t;
  }, [items]);

  const allDecided = items.length > 0 && tally.pending === 0;
  const pendingExists = items.some((it) => it.decision === "pending");
  // Nothing left to triage: either the source extracted no candidates, or every
  // candidate was already confirmed in a previous visit.
  const nothingExtracted = items.length === 0;
  const allConfirmed =
    items.length > 0 && items.every((it) => it.decidedAt !== null);
  const nothingToSort =
    !loading && !loadError && !summary && (nothingExtracted || allConfirmed);

  const goReview = useCallback(() => window.location.assign("/review"), []);
  const goLibrary = useCallback(() => window.location.assign("/library"), []);

  // Fold server-returned items into the live list and the synchronous ref in
  // one step, so the next cursor advance can read the fresh state immediately.
  const applyDecisions = useCallback((updated: ExtractionItemView[]) => {
    const byId = new Map(updated.map((u) => [u.id, u]));
    const next = itemsRef.current.map((it) => byId.get(it.id) ?? it);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const decide = useCallback(
    async (item: ExtractionItemView, decision: TriageDecision) => {
      // A stale handler (e.g. a fast second keypress before re-render) can fire
      // on a word that already left the queue — just move the cursor on rather
      // than re-deciding it.
      const live = itemsRef.current.find((it) => it.id === item.id);
      if (live && live.decision !== "pending") {
        setCurrentId(nextPendingId(itemsRef.current, item.id));
        return;
      }
      const prior = { id: item.id, decision: item.decision };
      try {
        const updated = await patchDecision(item.id, decision);
        applyDecisions([updated]);
        setUndoStack((s) => [...s, { prior: [prior] }]);
        // Advance off the freshly-updated snapshot — never the render closure.
        setCurrentId(nextPendingId(itemsRef.current, item.id));
      } catch (err) {
        setToast({
          text:
            err instanceof Error ? err.message : "Couldn't save that decision.",
          variant: "error",
        });
      }
    },
    [applyDecisions],
  );

  const bulk = useCallback(
    async (group: TriageGroup, decision: TriageDecision) => {
      // Only still-undecided items — bulk never overrides a hand decision.
      const affected = items.filter(
        (it) => it.decision === "pending" && groupOf(it) === group,
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
        // Advance to the first still-pending word off the fresh snapshot.
        setCurrentId(nextPendingId(itemsRef.current, null));
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
    [items, sourceId, batchNo, applyDecisions],
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
          text: `Kept ${res.learn} ${res.learn === 1 ? "word" : "words"}.`,
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
        // A resolved hit is now a kept word (new row or merged into an
        // existing one) — fold it into the summary counts.
        setSummary(
          (s) =>
            s && {
              ...s,
              materialized: s.materialized + 1,
              learn: hit.item.decision === "learn" ? s.learn + 1 : s.learn,
              known: hit.item.decision === "know" ? s.known + 1 : s.known,
            },
        );
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
    // An unknown/invalid source is a dead end — don't offer a pointless reload;
    // route the user somewhere useful instead.
    if (loadErrorCode === "not_found") {
      return (
        <main className="triage">
          <EmptyState message="That extraction isn't available. It may have been removed.">
            <Button variant="primary" onClick={goReview}>
              Go to review
            </Button>
            <Button variant="quiet" onClick={goLibrary}>
              Open library
            </Button>
          </EmptyState>
        </main>
      );
    }
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

  // Confirm finished cleanly (or all dupes resolved) — tell the user what
  // happened and point them at the obvious next step: reviewing the words they
  // just kept.
  if (summary && dedupeHits.length === 0) {
    const kept = summary.learn;
    const detailParts: string[] = [];
    if (summary.known > 0) {
      detailParts.push(`${summary.known} already known, archived`);
    }
    if (summary.skipped > 0) {
      detailParts.push(`${summary.skipped} skipped`);
    }
    const moreBatches = batchNo < batchCount;
    return (
      <main className="triage triage--summary">
        <div className="triage__summary">
          <p className="triage__summary-headline">
            {kept > 0
              ? `${kept} ${kept === 1 ? "word" : "words"} added to your review queue`
              : "No new words added this time"}
          </p>
          {detailParts.length > 0 && (
            <p className="triage__summary-detail">{detailParts.join(" · ")}</p>
          )}
          <p className="triage__summary-next">
            {kept > 0
              ? "Start a review session to begin learning them."
              : "Head to review to keep studying what's due."}
          </p>
        </div>
        <div className="triage__summary-actions">
          <Button variant="primary" onClick={goReview}>
            Review now
          </Button>
          {moreBatches && (
            <Button variant="secondary" onClick={() => void load()}>
              Sort the next batch
            </Button>
          )}
          <Button variant="quiet" onClick={goLibrary}>
            Back to library
          </Button>
        </div>
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
        <EmptyState
          message={
            allConfirmed
              ? "You've already sorted every word from this extraction."
              : "Nothing to sort here yet."
          }
        >
          <Button variant="primary" onClick={goReview}>
            Go to review
          </Button>
          <Button variant="quiet" onClick={goLibrary}>
            Open library
          </Button>
        </EmptyState>
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

  const sortedCount = tally.know + tally.learn + tally.skip;

  return (
    <main className="triage">
      <header className="triage__header">
        <h1 className="triage__title">{source?.title ?? "Extraction"}</h1>
        <p className="triage__meta">
          Batch {batchNo} of {Math.max(batchCount, batchNo)} · {sortedCount} of{" "}
          {items.length} sorted
        </p>
        <div className="triage__progress-track" aria-hidden="true">
          <div
            className="triage__progress-fill"
            style={{
              width: `${items.length ? (sortedCount / items.length) * 100 : 0}%`,
            }}
          />
        </div>
      </header>

      {pendingExists ? (
        <div className="triage__groups">
          {groups.map((g) => {
            // A decided word leaves the visible queue immediately — only the
            // still-undecided candidates are shown.
            const groupItems = flow.filter(
              (it) => groupOf(it) === g.key && it.decision === "pending",
            );
            if (groupItems.length === 0) return null;
            return (
              <section className="triage__group" key={g.key}>
                <div className="triage__group-header">
                  <span className="triage__group-label">
                    {g.label} · {groupItems.length}
                  </span>
                  <Button
                    variant="quiet"
                    onClick={() => void bulk(g.key, g.decision)}
                  >
                    {g.bulkLabel} {groupItems.length}
                  </Button>
                </div>
                {groupItems.map((it) => (
                  <div
                    key={it.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(it.id, el);
                      else rowRefs.current.delete(it.id);
                    }}
                  >
                    <TriageRow
                      word={toWordEntry(it)}
                      state={it.id === currentId ? "current" : "upcoming"}
                      onKnow={() => void decide(it, "know")}
                      onLearn={() => void decide(it, "learn")}
                      onSkip={() => void decide(it, "skip")}
                    />
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="triage__ready">
          <p className="triage__ready-headline">Everything sorted</p>
          <p className="triage__ready-detail">
            {tally.learn} to learn · {tally.know} known · {tally.skip} skipped.
            Keep your words below.
          </p>
        </div>
      )}

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
              {/* Kept = learn only; known-archived words are counted apart. */}
              Keep {tally.learn} {tally.learn === 1 ? "word" : "words"}
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
