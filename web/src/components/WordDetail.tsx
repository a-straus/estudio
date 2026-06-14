import { useState } from "react";
import { Button } from "./Button";
import { TextInput } from "./TextInput";
import { WordEntry } from "./WordEntry";
import type { WordEntryData } from "./WordEntry";
import "./WordDetail.css";

export interface WordDetailFields {
  glossEs: string;
  glossEn: string;
  example: string;
}

interface WordDetailProps {
  word: WordEntryData;
  /** Provenance line, e.g. "from Moby-Dick ch. 41 · machine-defined, edited by you". */
  provenance?: string;
  /** Last reviews, oldest first; true = correct. Only the last 20 render. */
  history?: boolean[];
  /** Status + due line, e.g. "MATURE · next review Jun 21". */
  statusLine?: string;
  onSave?: (fields: WordDetailFields) => void | Promise<void>;
  /** "I forgot this": card due now, SM-2 demoted. Caller shows the toast. */
  onForgot?: () => void;
  onDelete?: () => void;
}

type Mode = "viewing" | "editing" | "saving" | "confirm-delete";

/** WordDetail — Library detail panel. Composes WordEntry with editing. */
export function WordDetail({
  word,
  provenance,
  history,
  statusLine,
  onSave,
  onForgot,
  onDelete,
}: WordDetailProps) {
  const [mode, setMode] = useState<Mode>("viewing");
  const [draft, setDraft] = useState<WordDetailFields>({
    glossEs: word.glossEs ?? "",
    glossEn: word.glossEn ?? "",
    example: word.example ?? "",
  });

  const startEditing = () => {
    setDraft({
      glossEs: word.glossEs ?? "",
      glossEn: word.glossEn ?? "",
      example: word.example ?? "",
    });
    setMode("editing");
  };

  const save = async () => {
    setMode("saving");
    try {
      await onSave?.(draft);
    } finally {
      setMode("viewing");
    }
  };

  const editing = mode === "editing" || mode === "saving";
  const ticks = history?.slice(-20) ?? [];

  return (
    <div className="word-detail">
      {editing ? (
        <>
          <WordEntry
            size="full"
            {...word}
            glossEs={undefined}
            glossEn={undefined}
            example={undefined}
          />
          <div className="word-detail__form">
            <TextInput
              label="Definition (Spanish)"
              value={draft.glossEs}
              onChange={(glossEs) => setDraft({ ...draft, glossEs })}
              multiline
              study
              disabled={mode === "saving"}
            />
            <TextInput
              label="Definition (English)"
              value={draft.glossEn}
              onChange={(glossEn) => setDraft({ ...draft, glossEn })}
              multiline
              disabled={mode === "saving"}
            />
            <TextInput
              label="Example"
              value={draft.example}
              onChange={(example) => setDraft({ ...draft, example })}
              multiline
              study
              disabled={mode === "saving"}
            />
          </div>
          <div className="word-detail__footer">
            <Button
              variant="primary"
              busy={mode === "saving"}
              busyLabel="Saving…"
              onClick={save}
            >
              Save
            </Button>
            <Button
              variant="quiet"
              disabled={mode === "saving"}
              onClick={() => setMode("viewing")}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <WordEntry size="full" {...word} tappable />
          <p className="word-detail__tap-hint">Tap a word to add it</p>
          {provenance && (
            <p className="word-detail__provenance">{provenance}</p>
          )}
          {ticks.length > 0 && (
            <div
              className="word-detail__history"
              role="img"
              aria-label={`Last ${ticks.length} reviews`}
            >
              {ticks.map((correct, i) => (
                <span
                  key={i}
                  className={
                    "word-detail__tick" +
                    (correct
                      ? " word-detail__tick--correct"
                      : " word-detail__tick--incorrect")
                  }
                />
              ))}
            </div>
          )}
          {statusLine && <p className="word-detail__status">{statusLine}</p>}
          {mode === "confirm-delete" && (
            <div
              className="word-detail__confirm"
              role="alertdialog"
              aria-label="Confirm delete"
            >
              <p className="word-detail__confirm-message">
                Delete{" "}
                <i className="word-detail__confirm-word">{word.headword}</i>?
                Its card and schedule go with it.
              </p>
              <div className="word-detail__confirm-actions">
                <Button variant="danger" onClick={onDelete}>
                  Delete
                </Button>
                <Button variant="quiet" onClick={() => setMode("viewing")}>
                  Keep
                </Button>
              </div>
            </div>
          )}
          <div className="word-detail__footer">
            <Button variant="quiet" onClick={onForgot}>
              I forgot this
            </Button>
            <Button variant="quiet" onClick={startEditing}>
              Edit
            </Button>
            <Button
              variant="danger"
              className="word-detail__delete"
              onClick={() => setMode("confirm-delete")}
            >
              Delete word…
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
