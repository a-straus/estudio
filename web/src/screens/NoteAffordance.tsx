// Compact note-taking affordance rendered after a question is graded.
// Used in both Quiz and Lesson screens.
import { useCallback, useEffect, useState } from "react";
import { Button, TextInput } from "../components";
import {
  createNote,
  listNotes,
  updateNote,
} from "./notesApi";
import "./NoteAffordance.css";

interface NoteAffordanceProps {
  questionId: number;
}

/**
 * Shows "Add a note" (or "Edit note" if one exists) after a question is
 * graded. Expands to a textarea on click; saves via POST (create) or PATCH
 * (update). Placed inside the thumb-zone action region.
 */
export function NoteAffordance({ questionId }: NoteAffordanceProps) {
  const [open, setOpen] = useState(false);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Check for an existing note when the affordance first mounts (post-grade).
  useEffect(() => {
    listNotes({ quizQuestionId: questionId })
      .then(({ notes }) => {
        if (notes.length > 0) {
          setNoteId(notes[0].id);
          setText(notes[0].body);
          setHasExisting(true);
        }
      })
      .catch(() => {});
  }, [questionId]);

  const save = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (noteId !== null) {
        await updateNote(noteId, { body: text.trim() });
      } else {
        const { note } = await createNote({
          quizQuestionId: questionId,
          body: text.trim(),
        });
        setNoteId(note.id);
        setHasExisting(true);
      }
      setOpen(false);
    } catch {
      setSaveError("Couldn't save that note.");
    } finally {
      setSaving(false);
    }
  }, [noteId, text, questionId]);

  if (!open) {
    return (
      <Button variant="quiet" onClick={() => setOpen(true)}>
        {hasExisting ? "Edit note" : "Add a note"}
      </Button>
    );
  }

  return (
    <div className="note-affordance">
      <TextInput
        label="Note"
        value={text}
        onChange={setText}
        multiline
        placeholder="What do you want to remember about this?"
        disabled={saving}
      />
      <div className="note-affordance__actions">
        <Button
          variant="primary"
          disabled={saving || !text.trim()}
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button
          variant="quiet"
          disabled={saving}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
      {saveError && <span className="note-affordance__error">{saveError}</span>}
    </div>
  );
}
