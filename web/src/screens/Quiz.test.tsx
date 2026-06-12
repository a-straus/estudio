// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { QuizQuestionView } from "@estudio/shared";
import "../test/setup";

vi.mock("./quizApi", () => ({
  ApiError: class ApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  generateQuiz: vi.fn(),
  fetchQuizQuestions: vi.fn(),
  answerQuiz: vi.fn(),
  submitAttempt: vi.fn(),
  flagQuestion: vi.fn(),
}));

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

import { Quiz } from "./Quiz";
import * as api from "./quizApi";
import * as notesApi from "./notesApi";

const mockApi = api as unknown as {
  ApiError: new (m: string, c: string) => Error;
  generateQuiz: ReturnType<typeof vi.fn>;
  fetchQuizQuestions: ReturnType<typeof vi.fn>;
  answerQuiz: ReturnType<typeof vi.fn>;
  submitAttempt: ReturnType<typeof vi.fn>;
};

const mockNotes = notesApi as unknown as {
  listNotes: ReturnType<typeof vi.fn>;
  createNote: ReturnType<typeof vi.fn>;
  updateNote: ReturnType<typeof vi.fn>;
};

function defMatchQ(over: Partial<QuizQuestionView> = {}): QuizQuestionView {
  return {
    id: 1,
    wordId: 1,
    style: "def_match",
    direction: "w2d",
    cue: "barco",
    stemBefore: null,
    stemAfter: null,
    options: ["boat", "car", "plane", "train"],
    answer: "boat",
    term: "barco",
    lemma: null,
    partOfSpeech: "sustantivo",
    definitionEs: "embarcación",
    definitionEn: "boat",
    example: "un barco",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.submitAttempt.mockResolvedValue({ id: 1 });
  mockNotes.listNotes.mockResolvedValue({ notes: [] });
  mockNotes.createNote.mockResolvedValue({
    note: {
      id: 42,
      quizQuestionId: 1,
      body: "my note",
      label: "barco",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  });
});

describe("Quiz — Setup", () => {
  it("renders the setup form with all controls and Start", () => {
    // The screen title now lives in the masthead (AppShell), not a duplicate
    // in-screen heading — Setup opens straight into the form controls.
    render(<Quiz pollIntervalMs={10} />);
    expect(screen.getByRole("radiogroup", { name: "Deck" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Length" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Style" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Direction" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start quiz" })).toBeTruthy();
  });

  it("shows the empty state when the deck has no eligible words", async () => {
    mockApi.generateQuiz.mockRejectedValue(
      new mockApi.ApiError("nope", "no_eligible_words"),
    );
    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    expect(
      await screen.findByText("No words yet. Ingest something first."),
    ).toBeTruthy();
  });
});

describe("Quiz — Loading", () => {
  it("shows the generation progress line while writing questions", async () => {
    mockApi.generateQuiz.mockResolvedValue({ jobId: 7 });
    mockApi.fetchQuizQuestions.mockResolvedValue({
      status: "running",
      progress: { step: 3, total: 10 },
      error: null,
      questions: [],
    });
    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    expect(await screen.findByText("Writing questions… 3 of 10")).toBeTruthy();
  });

  it("surfaces a generation failure with a retry", async () => {
    mockApi.generateQuiz.mockResolvedValue({ jobId: 7 });
    mockApi.fetchQuizQuestions.mockResolvedValue({
      status: "failed",
      progress: null,
      error: "boom",
      questions: [],
    });
    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    expect(
      await screen.findByText(
        "Couldn't write questions. Try a shorter quiz, or retry.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("Quiz — Play → Results", () => {
  it("colors instantly on tap with no Check-answer click", async () => {
    mockApi.generateQuiz.mockResolvedValue({ jobId: 7 });
    mockApi.fetchQuizQuestions.mockResolvedValue({
      status: "done",
      progress: { step: 1, total: 1 },
      error: null,
      questions: [defMatchQ()],
    });
    mockApi.answerQuiz.mockResolvedValue({
      correct: true,
      correctAnswer: "boat",
      explanation: "a boat floats.",
    });

    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));

    // Play begins once questions exist.
    expect(await screen.findByText("Q 1 of 1")).toBeTruthy();

    // No Check-answer / Don't know affordances on multiple choice.
    expect(screen.queryByRole("button", { name: "Check answer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Don’t know" })).toBeNull();

    // Picking the option grades immediately (local), then still POSTs.
    fireEvent.click(screen.getByText("boat"));
    expect(await screen.findByText("Correct.")).toBeTruthy();
    expect(mockApi.answerQuiz).toHaveBeenCalledWith({
      questionId: 1,
      given: "boat",
      direction: "w2d",
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // Results region.
    expect(await screen.findByText("1 of 1")).toBeTruthy();
    await waitFor(() => expect(mockApi.submitAttempt).toHaveBeenCalled());
  });

  it("auto-reveals the explanation on a wrong tap and offers Retake missed", async () => {
    mockApi.generateQuiz.mockResolvedValue({ jobId: 7 });
    mockApi.fetchQuizQuestions.mockResolvedValue({
      status: "done",
      progress: { step: 1, total: 1 },
      error: null,
      questions: [defMatchQ()],
    });
    mockApi.answerQuiz.mockResolvedValue({
      correct: false,
      correctAnswer: "boat",
      explanation: "a boat floats.",
    });

    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await screen.findByText("Q 1 of 1");

    // Pick a wrong option: instant "Not quite.", explanation auto-expanded.
    fireEvent.click(screen.getByText("car"));
    expect(await screen.findByText("Not quite.")).toBeTruthy();
    expect(mockApi.answerQuiz).toHaveBeenCalledWith({
      questionId: 1,
      given: "car",
      direction: "w2d",
    });
    expect(screen.getByRole("button", { name: "Explain why" })).toBeTruthy();
    expect(await screen.findByText("a boat floats.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("0 of 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retake missed" })).toBeTruthy();
  });

  it("shows 'Add a note' affordance after grading and saves a new note on submit", async () => {
    mockApi.generateQuiz.mockResolvedValue({ jobId: 7 });
    mockApi.fetchQuizQuestions.mockResolvedValue({
      status: "done",
      progress: { step: 1, total: 1 },
      error: null,
      questions: [defMatchQ()],
    });
    mockApi.answerQuiz.mockResolvedValue({
      correct: true,
      correctAnswer: "boat",
      explanation: "a boat floats.",
    });

    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await screen.findByText("Q 1 of 1");
    fireEvent.click(screen.getByText("boat"));
    await screen.findByText("Correct.");

    // Note affordance appears after grading.
    expect(screen.getByRole("button", { name: "Add a note" })).toBeTruthy();

    // Open the note textarea and type.
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    const textarea = screen.getByLabelText("Note");
    fireEvent.change(textarea, { target: { value: "hard word" } });

    // Save triggers POST.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockNotes.createNote).toHaveBeenCalledWith({
        quizQuestionId: 1,
        body: "hard word",
      }),
    );
  });

  it("shows 'Edit note' when an existing note is loaded for the question", async () => {
    mockNotes.listNotes.mockResolvedValue({
      notes: [
        {
          id: 10,
          quizQuestionId: 1,
          body: "existing note",
          label: "barco",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    mockApi.generateQuiz.mockResolvedValue({ jobId: 7 });
    mockApi.fetchQuizQuestions.mockResolvedValue({
      status: "done",
      progress: { step: 1, total: 1 },
      error: null,
      questions: [defMatchQ()],
    });
    mockApi.answerQuiz.mockResolvedValue({
      correct: true,
      correctAnswer: "boat",
      explanation: "a boat floats.",
    });

    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await screen.findByText("Q 1 of 1");
    fireEvent.click(screen.getByText("boat"));
    await screen.findByText("Correct.");

    // After existing note loads, button label changes.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit note" })).toBeTruthy(),
    );
  });

  it("surfaces a grade-persistence failure without blocking the local color", async () => {
    mockApi.generateQuiz.mockResolvedValue({ jobId: 7 });
    mockApi.fetchQuizQuestions.mockResolvedValue({
      status: "done",
      progress: { step: 1, total: 1 },
      error: null,
      questions: [defMatchQ()],
    });
    mockApi.answerQuiz.mockRejectedValue(new Error("network down"));

    render(<Quiz pollIntervalMs={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await screen.findByText("Q 1 of 1");

    fireEvent.click(screen.getByText("boat"));
    // Local grade still shows green/Correct.
    expect(await screen.findByText("Correct.")).toBeTruthy();
    // The failed persist surfaces an inline error.
    expect(
      await screen.findByText("Couldn't save that answer. Your score still counts."),
    ).toBeTruthy();
  });
});
