import { useCallback, useEffect, useRef, useState } from "react";
import type { PlacementBand, PlacementWord, BandAnswers } from "@estudio/shared";
import { Button, EmptyState, WordEntry } from "../components";
import {
  completePlacement,
  fetchNextBand,
  fetchPlacementStatus,
} from "./placementApi";
import "./Placement.css";

type Phase = "intro" | "loading" | "probe" | "result" | "error";

interface ProbeState {
  band: PlacementBand;
  words: PlacementWord[];
  wordIndex: number;
  knownTerms: Set<string>;
}

interface RunState {
  completedBands: BandAnswers[];
  probe: ProbeState | null;
  level: PlacementBand | null;
  seeded: number | null;
}

const BAND_LABELS: Record<PlacementBand, string> = {
  B2: "B2",
  C1: "C1",
  C2: "C2",
  "rare-archaic": "rare/archaic",
};

export function Placement() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [run, setRun] = useState<RunState>({
    completedBands: [],
    probe: null,
    level: null,
    seeded: null,
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // Total words seen across all bands
  const totalWords = run.completedBands.reduce((s, b) => s + b.words.length, 0);
  const wordIndexInRun =
    totalWords + (run.probe ? run.probe.wordIndex : 0) + 1;

  const startRun = useCallback(async () => {
    setPhase("loading");
    setErrorMsg(null);
    const freshRun: RunState = {
      completedBands: [],
      probe: null,
      level: null,
      seeded: null,
    };
    setRun(freshRun);
    try {
      const resp = await fetchNextBand({ completedBands: [] });
      if (resp.done) {
        setRun((r) => ({ ...r, level: resp.level }));
        setPhase("result");
        return;
      }
      setRun((r) => ({
        ...r,
        probe: {
          band: resp.band,
          words: resp.words,
          wordIndex: 0,
          knownTerms: new Set(),
        },
      }));
      setPhase("probe");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Couldn't fetch placement words — try again.",
      );
      setPhase("error");
    }
  }, []);

  const advance = useCallback(
    async (knew: boolean) => {
      if (!run.probe) return;

      const { band, words, wordIndex, knownTerms } = run.probe;
      const currentWord = words[wordIndex];
      const newKnownTerms = new Set(knownTerms);
      if (knew) newKnownTerms.add(currentWord.term);

      const isLastWordInBand = wordIndex >= words.length - 1;

      if (!isLastWordInBand) {
        setRun((r) =>
          r.probe
            ? {
                ...r,
                probe: {
                  ...r.probe,
                  wordIndex: r.probe.wordIndex + 1,
                  knownTerms: newKnownTerms,
                },
              }
            : r,
        );
        return;
      }

      // Band complete — finalize it and ask server for next step
      const completedBand: BandAnswers = {
        band,
        words,
        knownTerms: Array.from(newKnownTerms),
      };
      const newCompletedBands = [...run.completedBands, completedBand];

      setPhase("loading");
      setRun((r) => ({ ...r, completedBands: newCompletedBands, probe: null }));

      try {
        const resp = await fetchNextBand({ completedBands: newCompletedBands });
        if (resp.done) {
          setRun((r) => ({ ...r, level: resp.level }));
          setPhase("result");
        } else {
          setRun((r) => ({
            ...r,
            probe: {
              band: resp.band,
              words: resp.words,
              wordIndex: 0,
              knownTerms: new Set(),
            },
          }));
          setPhase("probe");
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Couldn't fetch placement words — try again.",
        );
        setPhase("error");
      }
    },
    [run],
  );

  const complete = useCallback(async () => {
    if (!run.level) return;
    setCompleting(true);

    // Collect all known words across all bands
    const knownWords: PlacementWord[] = [];
    for (const band of run.completedBands) {
      const knownSet = new Set(band.knownTerms);
      for (const w of band.words) {
        if (knownSet.has(w.term)) knownWords.push(w);
      }
    }

    try {
      const resp = await completePlacement({
        level: run.level,
        knownWords,
      });
      setRun((r) => ({ ...r, seeded: resp.seeded }));
    } catch {
      // Completion error is non-fatal — result still shows
    } finally {
      setCompleting(false);
    }
  }, [run]);

  // Auto-complete when result phase is entered
  const completedRef = useRef(false);
  useEffect(() => {
    if (phase === "result" && !completedRef.current && !run.seeded) {
      completedRef.current = true;
      complete();
    }
  }, [phase, complete, run.seeded]);

  // Keyboard handler for probe phase
  useEffect(() => {
    if (phase !== "probe") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" || e.key === "K") advance(true);
      else if (e.key === "n" || e.key === "N") advance(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, advance]);

  if (phase === "intro") {
    return (
      <main className="placement">
        <div className="placement__card">
          <p className="placement__intro-text">
            Mark the English words you already know. About 20 words, a minute —
            it tunes which words the app tests you on.
          </p>
          <div className="placement__actions">
            <Button variant="primary" onClick={startRun}>
              Start
            </Button>
            <Button
              variant="quiet"
              onClick={() => (window.location.href = "/system")}
            >
              Maybe later
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main className="placement">
        <div className="placement__card">
          <div className="placement__entry-skeleton">
            <span className="placement__headword-skeleton">—</span>
          </div>
          <p className="placement__meta">finding words…</p>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="placement">
        <div className="placement__card">
          <EmptyState
            message={
              errorMsg ?? "Couldn't fetch placement words — try again."
            }
          />
          <div className="placement__actions placement__actions--center">
            <Button variant="quiet" onClick={startRun}>
              Retry
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "probe" && run.probe) {
    const { words, wordIndex, band } = run.probe;
    const word = words[wordIndex];

    return (
      <main className="placement">
        <div className="placement__card">
          <div className="placement__entry">
            <WordEntry
              headword={word.term}
              lemma={word.lemma !== word.term ? word.lemma : undefined}
              language="EN"
              partOfSpeech={word.part_of_speech}
              level={BAND_LABELS[band]}
              size="hero"
            />
          </div>
          <p className="placement__meta">
            word {wordIndexInRun} · narrowing your level
          </p>
          <div className="placement__thumb-zone">
            <Button
              variant="secondary"
              className="placement__btn"
              onClick={() => advance(true)}
            >
              I know this
            </Button>
            <Button
              variant="secondary"
              className="placement__btn"
              onClick={() => advance(false)}
            >
              New to me
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "result") {
    const level = run.level;
    const seeded = run.seeded;

    return (
      <main className="placement">
        <div className="placement__card">
          <p className="placement__verdict">
            Your English level · ~{level ?? "—"}.{" "}
            {completing
              ? "Seeding known words…"
              : seeded !== null
                ? `Seeded ${seeded} known ${seeded === 1 ? "word" : "words"} for calibration.`
                : ""}
          </p>
          <p className="placement__note">
            Words you marked known are in your English deck as known — they
            won't be re-tested. The rest weren't added.
          </p>
          <div className="placement__actions">
            <Button
              variant="primary"
              onClick={() => (window.location.href = "/system")}
            >
              Done
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                completedRef.current = false;
                startRun();
              }}
            >
              Run again
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return null;
}
