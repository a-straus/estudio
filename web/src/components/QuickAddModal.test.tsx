// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../test/setup";
import type { WordDetailResponse } from "@estudio/shared";
import { QuickAddModal } from "./QuickAddModal";

vi.mock("../screens/libraryApi", () => ({
  createWord: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock("./RecordButton", () => ({
  RecordButton: ({ onRecorded }: { onRecorded?: (b: Blob) => void }) => (
    <button
      type="button"
      data-testid="record-button"
      onClick={() => onRecorded?.(new Blob(["fake"], { type: "audio/webm" }))}
    >
      🎙
    </button>
  ),
}));

import { createWord, transcribeAudio } from "../screens/libraryApi";
const mockCreateWord = createWord as ReturnType<typeof vi.fn>;
const mockTranscribeAudio = transcribeAudio as ReturnType<typeof vi.fn>;

const FAKE_WORD: WordDetailResponse = {
  id: 1,
  term: "hola",
  lemma: null,
  language: "es",
  partOfSpeech: null,
  definitionEs: null,
  definitionEn: "hello",
  example: null,
  level: null,
  status: "new",
  deckId: 1,
  sourceId: null,
  definitionOrigin: "llm",
  ownerEditedAt: null,
  promptVersion: null,
  sourceTitle: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  cardState: null,
  recentReviews: [],
};

beforeEach(() => {
  mockCreateWord.mockReset();
  mockTranscribeAudio.mockReset();
});

describe("QuickAddModal", () => {
  it("renders nothing when closed", () => {
    render(
      <QuickAddModal open={false} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog with a focused term field when open", () => {
    render(<QuickAddModal open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const field = screen.getByLabelText("Word or phrase");
    expect(field).toBeTruthy();
  });

  it("calls createWord and fires onAdded on successful submit", async () => {
    mockCreateWord.mockResolvedValue(FAKE_WORD);
    const onAdded = vi.fn();
    const onClose = vi.fn();
    render(<QuickAddModal open onClose={onClose} onAdded={onAdded} />);

    const field = screen.getByLabelText("Word or phrase");
    fireEvent.change(field, { target: { value: "hola" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockCreateWord).toHaveBeenCalledWith({ term: "hola", language: "es" });
      expect(onAdded).toHaveBeenCalledWith(FAKE_WORD);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows inline error and keeps modal open when createWord rejects", async () => {
    mockCreateWord.mockRejectedValue(new Error("network error"));
    const onClose = vi.fn();
    render(<QuickAddModal open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Word or phrase"), {
      target: { value: "hola" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't add — try again, or add a definition by hand."),
      ).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows validation error for empty term without calling the API", () => {
    render(<QuickAddModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Enter a word or phrase.")).toBeTruthy();
    expect(mockCreateWord).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<QuickAddModal open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<QuickAddModal open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("fills the term field via RecordButton dictation", async () => {
    mockTranscribeAudio.mockResolvedValue({ text: "hola" });
    render(<QuickAddModal open onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("record-button"));

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Word or phrase") as HTMLInputElement).value,
      ).toBe("hola");
    });
  });
});
