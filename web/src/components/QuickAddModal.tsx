import { useCallback, useEffect, useRef, useState } from "react";
import type { WordDetailResponse, WordLanguage } from "@estudio/shared";
import { createWord, transcribeAudio, ApiError } from "../screens/libraryApi";
import { Button } from "./Button";
import { RecordButton } from "./RecordButton";
import { SegmentedControl } from "./SegmentedControl";
import { TextInput } from "./TextInput";
import "./QuickAddModal.css";

const LANG_OPTIONS = [
  { value: "es", label: "Spanish" },
  { value: "en", label: "English" },
];

interface QuickAddModalProps {
  open: boolean;
  onClose: () => void;
  onAdded?: (word: WordDetailResponse) => void;
  initialTerm?: string;
  initialLanguage?: WordLanguage;
}

export function QuickAddModal({
  open,
  onClose,
  onAdded,
  initialTerm,
  initialLanguage,
}: QuickAddModalProps) {
  const [term, setTerm] = useState("");
  const [language, setLanguage] = useState<WordLanguage>("es");
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const titleId = "quick-add-title";
  const openerRef = useRef<Element | null>(null);

  // Capture initial values at open time without including them as effect deps
  // so they don't override user edits if the parent re-renders mid-session.
  const initialTermRef = useRef(initialTerm);
  const initialLanguageRef = useRef(initialLanguage);
  initialTermRef.current = initialTerm;
  initialLanguageRef.current = initialLanguage;

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
      setTerm(initialTermRef.current ?? "");
      setLanguage(initialLanguageRef.current ?? "es");
    } else {
      setTerm("");
      setLanguage("es");
      setSaving(false);
      setTranscribing(false);
      setError(undefined);
      if (openerRef.current instanceof HTMLElement) {
        openerRef.current.focus();
      }
    }
  // open is the only dep: we read initial values via refs at transition time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = useCallback(() => {
    if (saving) return;
    onClose();
  }, [saving, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = term.trim();
    if (!trimmed) {
      setError("Enter a word or phrase.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const created = await createWord({ term: trimmed, language });
      onAdded?.(created);
      onClose();
    } catch {
      setError("Couldn't add — try again, or add a definition by hand.");
      setSaving(false);
    }
  }, [term, language, onAdded, onClose]);

  const handleRecorded = useCallback(async (audio: Blob) => {
    if (saving) return;
    setTranscribing(true);
    try {
      const { text } = await transcribeAudio(audio);
      setTerm(text);
      if (error) setError(undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not transcribe — type it instead.");
    } finally {
      setTranscribing(false);
    }
  }, [saving, error]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div
      className="quick-add-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="quick-add-panel"
      >
        <h2 id={titleId} className="quick-add-panel__title">
          Add a word
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="quick-add-panel__term-row">
            <TextInput
              label="Word or phrase"
              value={term}
              onChange={(v) => {
                setTerm(v);
                if (error) setError(undefined);
              }}
              study
              autoFocus
              disabled={saving}
              error={error}
            />
            <RecordButton
              onRecorded={(blob) => void handleRecorded(blob)}
              state={transcribing ? "transcribing" : undefined}
            />
          </div>
          {/* hidden submit so Enter in the field fires onSubmit */}
          <button type="submit" hidden aria-hidden="true" />
        </form>
        <SegmentedControl
          label="Language"
          options={LANG_OPTIONS}
          value={language}
          onChange={(v) => setLanguage(v as WordLanguage)}
        />
        <p className="quick-add-panel__help">
          Leave the definition — we'll fill it in.
        </p>
        <div className="quick-add-panel__actions">
          <Button
            variant="primary"
            busy={saving}
            busyLabel="Adding…"
            disabled={saving}
            onClick={() => void handleSubmit()}
          >
            Add
          </Button>
          <Button variant="quiet" disabled={saving} onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
