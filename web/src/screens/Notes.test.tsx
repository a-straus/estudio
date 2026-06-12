// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note } from "@estudio/shared";
import "../test/setup";

vi.mock("./notesApi", () => ({
  ApiError: class ApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

import { Notes } from "./Notes";
import * as notesApi from "./notesApi";

const mockNotesApi = notesApi as unknown as {
  ApiError: new (m: string, c: string) => Error;
  listNotes: ReturnType<typeof vi.fn>;
  deleteNote: ReturnType<typeof vi.fn>;
};

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 1,
    quizQuestionId: 10,
    body: "hard word",
    label: "barco",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Notes browse screen", () => {
  it("renders notes newest-first with label and body", async () => {
    mockNotesApi.listNotes.mockResolvedValue({
      notes: [
        makeNote({ id: 2, label: "hablar", body: "second note" }),
        makeNote({ id: 1, label: "barco", body: "first note" }),
      ],
    });

    render(<Notes />);

    expect(await screen.findByText("hablar")).toBeTruthy();
    expect(screen.getByText("second note")).toBeTruthy();
    expect(screen.getByText("barco")).toBeTruthy();
    expect(screen.getByText("first note")).toBeTruthy();
  });

  it("shows the empty state when there are no notes", async () => {
    mockNotesApi.listNotes.mockResolvedValue({ notes: [] });

    render(<Notes />);

    expect(
      await screen.findByText(/No notes yet/),
    ).toBeTruthy();
  });

  it("deletes a note on button click and removes it from the list", async () => {
    mockNotesApi.listNotes.mockResolvedValue({
      notes: [makeNote({ id: 5, label: "barco", body: "to delete" })],
    });
    mockNotesApi.deleteNote.mockResolvedValue(undefined);

    render(<Notes />);
    await screen.findByText("to delete");

    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

    await waitFor(() =>
      expect(screen.queryByText("to delete")).toBeNull(),
    );
    expect(mockNotesApi.deleteNote).toHaveBeenCalledWith(5);
  });

  it("shows an error state when loading fails", async () => {
    mockNotesApi.listNotes.mockRejectedValue(new Error("network fail"));

    render(<Notes />);

    expect(await screen.findByText(/Couldn't load notes/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});
