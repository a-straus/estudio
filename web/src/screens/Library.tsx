import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WordDetailResponse,
  WordLanguage,
  WordListItem,
  WordStatus,
} from "@estudio/shared";
import {
  Button,
  EmptyState,
  SegmentedControl,
  TextInput,
  Toast,
  WordDetail,
  WordEntry,
  type WordDetailFields,
} from "../components";
import {
  ApiError,
  createWord,
  deleteWord,
  demoteWord,
  fetchWord,
  fetchWords,
  updateWord,
} from "./libraryApi";
import "./Library.css";

// The seeded decks (001_init): Spanish = 1, English = 2. The Deck filter is
// really a language filter expressed as ES/EN/All.
const DECK_BY_LANGUAGE: Record<WordLanguage, number> = { es: 1, en: 2 };

type DeckFilter = "es" | "en" | "all";
type StatusFilter = WordStatus | "all";

const DECK_OPTIONS = [
  { value: "es", label: "ES" },
  { value: "en", label: "EN" },
  { value: "all", label: "All" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "mature", label: "Mature" },
];

const SEARCH_DEBOUNCE_MS = 200;

function toWordEntry(w: WordListItem | WordDetailResponse) {
  return {
    headword: w.term,
    lemma: w.lemma ?? undefined,
    language: w.language.toUpperCase(),
    partOfSpeech: w.partOfSpeech ?? undefined,
    level: w.level ?? undefined,
    glossEs: w.definitionEs ?? undefined,
    glossEn: w.definitionEn ?? undefined,
    example: w.example ?? undefined,
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDue(dueAt: string): string {
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return dueAt;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Status + due line for the detail panel, e.g. "MATURE · next review Jun 21". */
function statusLine(detail: WordDetailResponse): string {
  const status = detail.status.toUpperCase();
  if (!detail.cardState) return status;
  return `${status} · next review ${formatDue(detail.cardState.dueAt)}`;
}

/** Provenance line: source + who defined/edited it. */
function provenanceLine(detail: WordDetailResponse): string {
  const who =
    detail.definitionOrigin === "owner"
      ? "written by you"
      : detail.ownerEditedAt
        ? "defined by machine, edited by you"
        : "defined by machine";
  return detail.sourceTitle ? `from ${detail.sourceTitle} · ${who}` : who;
}

/** Last-20 review outcomes, oldest first (true = not a failure). */
function historyTicks(detail: WordDetailResponse): boolean[] {
  return detail.recentReviews.map((r) => r.grade !== "fail").reverse();
}

export function Library() {
  const [search, setSearch] = useState("");
  const [deck, setDeck] = useState<DeckFilter>("es");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [words, setWords] = useState<WordListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WordDetailResponse | null>(null);
  const [adding, setAdding] = useState(false);

  const [toast, setToast] = useState<{
    text: string;
    variant: "info" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchWords({
        q: search.trim() || undefined,
        status: status === "all" ? undefined : status,
        deckId: deck === "all" ? undefined : DECK_BY_LANGUAGE[deck],
        sort: "alpha",
      });
      setWords(res.items);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Couldn't load your words.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, deck, status]);

  // Debounced reload whenever a filter or the search query changes.
  useEffect(() => {
    const t = setTimeout(() => void load(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [load]);

  // Keep a ref so async callbacks can read the current selection without
  // re-subscribing every render.
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const openDetail = useCallback(async (id: number) => {
    setSelectedId(id);
    setAdding(false);
    setDetail(null);
    try {
      setDetail(await fetchWord(id));
    } catch (err) {
      setToast({
        text: err instanceof Error ? err.message : "Couldn't open that word.",
        variant: "error",
      });
      setSelectedId(null);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  const saveEdit = useCallback(async (id: number, fields: WordDetailFields) => {
    try {
      const updated = await updateWord(id, {
        definitionEs: fields.glossEs,
        definitionEn: fields.glossEn,
        example: fields.example,
      });
      setDetail(updated);
      setWords((ws) => ws.map((w) => (w.id === id ? { ...w, ...updated } : w)));
    } catch (err) {
      setToast({
        text: err instanceof Error ? err.message : "Couldn't save changes.",
        variant: "error",
      });
    }
  }, []);

  const removeWord = useCallback(
    async (id: number, term: string) => {
      try {
        await deleteWord(id);
        setWords((ws) => ws.filter((w) => w.id !== id));
        closeDetail();
        setToast({ text: `Deleted ${term}.`, variant: "info" });
      } catch (err) {
        setToast({
          text:
            err instanceof Error ? err.message : "Couldn't delete that word.",
          variant: "error",
        });
      }
    },
    [closeDetail],
  );

  const forget = useCallback(
    async (id: number, term: string) => {
      try {
        await demoteWord(id);
        setToast({ text: `${term} · due now`, variant: "info" });
        if (selectedIdRef.current === id) void openDetail(id);
      } catch (err) {
        const text =
          err instanceof ApiError && err.code === "no_card_state"
            ? `${term} hasn't entered review yet.`
            : err instanceof Error
              ? err.message
              : "Couldn't reset that card.";
        setToast({ text, variant: "error" });
      }
    },
    [openDetail],
  );

  const onAdded = useCallback(
    (created: WordDetailResponse) => {
      setAdding(false);
      setToast({ text: `Added ${created.term}.`, variant: "info" });
      void load();
      void openDetail(created.id);
    },
    [load, openDetail],
  );

  const detailPanel = adding ? (
    <AddWord
      onCancel={() => setAdding(false)}
      onAdded={onAdded}
      onError={(text) => setToast({ text, variant: "error" })}
    />
  ) : selectedId !== null ? (
    detail ? (
      <WordDetail
        word={toWordEntry(detail)}
        provenance={provenanceLine(detail)}
        history={historyTicks(detail)}
        statusLine={statusLine(detail)}
        onSave={(fields) => saveEdit(detail.id, fields)}
        onForgot={() => void forget(detail.id, detail.term)}
        onDelete={() => void removeWord(detail.id, detail.term)}
      />
    ) : (
      <p className="library__status">Loading…</p>
    )
  ) : null;

  return (
    <main className="library">
      <div
        className={
          "library__layout" +
          (selectedId !== null || adding ? " library__layout--detail-open" : "")
        }
      >
        <section className="library__list-pane" aria-label="Word list">
          <header className="library__toolbar">
            <div className="library__search">
              <TextInput
                label="Search words"
                value={search}
                onChange={setSearch}
                placeholder="Search words…"
              />
            </div>
            <div className="library__filters">
              <SegmentedControl
                label="Deck"
                options={DECK_OPTIONS}
                value={deck}
                onChange={(v) => setDeck(v as DeckFilter)}
              />
              <SegmentedControl
                label="Status"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(v) => setStatus(v as StatusFilter)}
              />
              <Button
                variant="quiet"
                className="library__add"
                onClick={() => {
                  setAdding(true);
                  setSelectedId(null);
                  setDetail(null);
                }}
              >
                Add word
              </Button>
            </div>
          </header>

          {loading ? (
            <p className="library__status">Loading…</p>
          ) : loadError ? (
            <EmptyState
              message={`${loadError} Reload, or check System for details.`}
            >
              <Button variant="secondary" onClick={() => void load()}>
                Reload
              </Button>
            </EmptyState>
          ) : words.length === 0 ? (
            <EmptyState message="No words yet. Ingest something, or add one by hand.">
              <Button variant="secondary" onClick={() => setAdding(true)}>
                Add word
              </Button>
            </EmptyState>
          ) : (
            <ul className="library__list">
              {words.map((w) => (
                <li
                  key={w.id}
                  className={
                    "library__row" +
                    (w.id === selectedId ? " library__row--selected" : "")
                  }
                >
                  <button
                    type="button"
                    className="library__row-main"
                    onClick={() => void openDetail(w.id)}
                  >
                    <WordEntry size="compact" {...toWordEntry(w)} />
                    <span className="library__row-status">{w.status}</span>
                  </button>
                  <button
                    type="button"
                    className="library__row-forgot"
                    onClick={() => void forget(w.id, w.term)}
                  >
                    I forgot this
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(selectedId !== null || adding) && (
          <section className="library__detail-pane" aria-label="Word detail">
            <button
              type="button"
              className="library__back"
              onClick={() => (adding ? setAdding(false) : closeDetail())}
            >
              ← Back
            </button>
            {detailPanel}
          </section>
        )}
      </div>

      {toast && (
        <Toast variant={toast.variant} onDismiss={() => setToast(null)}>
          {toast.text}
        </Toast>
      )}
    </main>
  );
}

interface AddWordProps {
  onAdded: (created: WordDetailResponse) => void;
  onCancel: () => void;
  onError: (text: string) => void;
}

/**
 * Add form. term required; leaving the definition blank lets the server
 * auto-define it (one LLM call) on save. A definition the owner writes is kept
 * verbatim (definition_origin owner).
 */
function AddWord({ onAdded, onCancel, onError }: AddWordProps) {
  const [term, setTerm] = useState("");
  const [language, setLanguage] = useState<WordLanguage>("es");
  const [definitionEn, setDefinitionEn] = useState("");
  const [example, setExample] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const autoDefining = saving && definitionEn.trim() === "";

  const submit = async () => {
    if (term.trim() === "") {
      setFieldError("Type the word first.");
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const created = await createWord({
        term: term.trim(),
        language,
        definitionEn: definitionEn.trim() || undefined,
        example: example.trim() || undefined,
      });
      onAdded(created);
    } catch (err) {
      if (err instanceof ApiError && err.code === "llm_failed") {
        setFieldError("Couldn't auto-fill. Write the definition, or retry.");
      } else if (err instanceof ApiError && err.code === "word_exists") {
        setFieldError("That word is already in your library.");
      } else {
        onError(err instanceof Error ? err.message : "Couldn't save the word.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="library__add-form">
      <h2 className="library__add-title">Add word</h2>
      <SegmentedControl
        label="Language"
        options={[
          { value: "es", label: "ES" },
          { value: "en", label: "EN" },
        ]}
        value={language}
        onChange={(v) => setLanguage(v as WordLanguage)}
      />
      <TextInput
        label="Word"
        value={term}
        onChange={setTerm}
        study
        autoFocus
        error={fieldError ?? undefined}
        placeholder="desasosiego"
      />
      <TextInput
        label="Definition (English)"
        value={definitionEn}
        onChange={setDefinitionEn}
        multiline
        help={autoDefining ? "defining…" : "Leave blank to auto-fill."}
      />
      <TextInput
        label="Example (optional)"
        value={example}
        onChange={setExample}
        study
        multiline
      />
      <div className="library__add-actions">
        <Button
          variant="primary"
          busy={saving}
          busyLabel={autoDefining ? "Defining…" : "Saving…"}
          onClick={() => void submit()}
        >
          Save word
        </Button>
        <Button variant="quiet" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
