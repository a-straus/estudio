import { useCallback, useEffect, useState } from "react";
import type { Note } from "@estudio/shared";
import { Button, EmptyState } from "../components";
import { ApiError, deleteNote, listNotes } from "./notesApi";
import "./Notes.css";

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { notes: items } = await listNotes();
      setNotes(items);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't load notes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = useCallback(async (id: number) => {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setError("Couldn't delete that note.");
    }
  }, []);

  if (loading) {
    return (
      <main className="notes">
        <p className="notes__status">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="notes">
        <EmptyState message={`${error} Reload to try again.`}>
          <Button variant="secondary" onClick={() => void load()}>
            Reload
          </Button>
        </EmptyState>
      </main>
    );
  }

  if (notes.length === 0) {
    return (
      <main className="notes">
        <EmptyState message="No notes yet. Add a note after answering a question." />
      </main>
    );
  }

  return (
    <main className="notes">
      <ul className="notes__list">
        {notes.map((note) => (
          <li key={note.id} className="note-item">
            <div className="note-item__header">
              <span className="note-item__label">{note.label}</span>
              <button
                type="button"
                className="note-item__delete"
                onClick={() => void remove(note.id)}
                aria-label="Delete note"
              >
                ×
              </button>
            </div>
            <p className="note-item__body">{note.body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
