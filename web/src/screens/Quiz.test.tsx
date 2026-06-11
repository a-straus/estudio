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

import { Quiz } from "./Quiz";
import * as api from "./quizApi";

const mockApi = api as unknown as {
  ApiError: new (m: string, c: string) => Error;
  generateQuiz: ReturnType<typeof vi.fn>;
  fetchQuizQuestions: ReturnType<typeof vi.fn>;
  answerQuiz: ReturnType<typeof vi.fn>;
  submitAttempt: ReturnType<typeof vi.fn>;
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
});

describe("Quiz — Setup", () => {
  it("renders the setup form with all controls and Start", () => {
    render(<Quiz pollIntervalMs={10} />);
    expect(screen.getByText("Quiz")).toBeTruthy();
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
