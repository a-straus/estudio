// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LessonView } from "@estudio/shared";
import "../test/setup";

vi.mock("./grammarApi", () => ({
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  fetchLesson: vi.fn(),
  generateLesson: vi.fn(),
  fetchLessonJob: vi.fn(),
  answerLesson: vi.fn(),
  submitLessonAttempt: vi.fn(),
}));

vi.mock("./notesApi", () => ({
  ApiError: class extends Error {
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

import { Lesson } from "./Lesson";
import * as api from "./grammarApi";
import * as notesApi from "./notesApi";

const mockApi = api as unknown as {
  fetchLesson: ReturnType<typeof vi.fn>;
  generateLesson: ReturnType<typeof vi.fn>;
  fetchLessonJob: ReturnType<typeof vi.fn>;
  answerLesson: ReturnType<typeof vi.fn>;
  submitLessonAttempt: ReturnType<typeof vi.fn>;
};

const mockNotes = notesApi as unknown as {
  listNotes: ReturnType<typeof vi.fn>;
  createNote: ReturnType<typeof vi.fn>;
};

const LESSON: LessonView = {
  id: 1,
  topicId: 10,
  topicName: "Subjuntivo: emoción",
  explanation: "First paragraph.\n\nSecond paragraph.",
  examples: [{ es: "Me alegra que vengas.", en: "I'm glad you're coming." }],
  questions: [
    {
      id: 100,
      style: "def_match",
      prompt: "Which is correct?",
      options: ["Espero que tengas razón.", "Espero que tienes razón."],
    },
  ],
};

beforeEach(() => {
  mockApi.fetchLesson.mockReset();
  mockApi.generateLesson.mockReset();
  mockApi.fetchLessonJob.mockReset();
  mockApi.answerLesson.mockReset();
  mockApi.submitLessonAttempt.mockReset();
  mockNotes.listNotes.mockResolvedValue({ notes: [] });
  mockNotes.createNote.mockResolvedValue({
    note: {
      id: 42,
      quizQuestionId: 100,
      body: "lesson note",
      label: "Subjuntivo",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  });
});

describe("Lesson screen", () => {
  it("reads a cached lesson, then quizzes with an explain-why reveal", async () => {
    mockApi.fetchLesson.mockResolvedValue({ lesson: LESSON });
    mockApi.answerLesson.mockResolvedValue({
      verdict: "correct",
      correctAnswer: "Espero que tengas razón.",
      explanation: "Hope triggers the subjunctive.",
      feedback: null,
    });
    mockApi.submitLessonAttempt.mockResolvedValue({
      id: 5,
      masteryBefore: 0.4,
      mastery: 0.58,
    });

    render(<Lesson topicId={10} />);

    // Reading: title + both paragraphs + the Spanish example.
    expect(await screen.findByText("Subjuntivo: emoción")).toBeTruthy();
    expect(screen.getByText("First paragraph.")).toBeTruthy();
    expect(screen.getByText("Second paragraph.")).toBeTruthy();
    expect(screen.getByText("Me alegra que vengas.")).toBeTruthy();

    // Into the quiz.
    fireEvent.click(screen.getByRole("button", { name: "Take the quiz" }));
    expect(await screen.findByText("Which is correct?")).toBeTruthy();

    // Pick the right option and check.
    fireEvent.click(screen.getByText("Espero que tengas razón."));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    // Verdict shows immediately; the explanation hides behind "Explain why".
    expect(await screen.findByText("Correct.")).toBeTruthy();
    expect(screen.queryByText("Hope triggers the subjunctive.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Explain why" }));
    expect(
      await screen.findByText("Hope triggers the subjunctive."),
    ).toBeTruthy();

    // Finish → results with score and the mastery change.
    fireEvent.click(screen.getByRole("button", { name: "See results" }));
    expect(await screen.findByText("1 of 1")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/40%/)).toBeTruthy(),
    );
    expect(screen.getByText("58%")).toBeTruthy();
    expect(mockApi.submitLessonAttempt).toHaveBeenCalledWith({
      topicId: 10,
      answers: [
        { questionId: 100, given: "Espero que tengas razón.", verdict: "correct" },
      ],
    });
  });

  it("renders the 'Partly right.' verdict tier", async () => {
    mockApi.fetchLesson.mockResolvedValue({ lesson: LESSON });
    mockApi.answerLesson.mockResolvedValue({
      verdict: "partial",
      correctAnswer: "Espero que tengas razón.",
      explanation: "Hope triggers the subjunctive.",
      feedback: "Close — try 'Espero que tengas razón.'",
    });

    render(<Lesson topicId={10} />);
    fireEvent.click(await screen.findByRole("button", { name: "Take the quiz" }));
    fireEvent.click(await screen.findByText("Espero que tienes razón."));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Partly right.")).toBeTruthy();
    expect(
      screen.getByText("Close — try 'Espero que tengas razón.'"),
    ).toBeTruthy();
  });

  it("surfaces a failed attempt-save and retries it without losing the attempt", async () => {
    mockApi.fetchLesson.mockResolvedValue({ lesson: LESSON });
    mockApi.answerLesson.mockResolvedValue({
      verdict: "correct",
      correctAnswer: "Espero que tengas razón.",
      explanation: "Hope triggers the subjunctive.",
      feedback: null,
    });
    // First save fails; the retry succeeds.
    mockApi.submitLessonAttempt
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ id: 5, masteryBefore: 0.4, mastery: 0.58 });

    render(<Lesson topicId={10} />);
    fireEvent.click(await screen.findByRole("button", { name: "Take the quiz" }));
    fireEvent.click(await screen.findByText("Espero que tengas razón."));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(await screen.findByRole("button", { name: "See results" }));

    // The failure is surfaced — never swallowed — with a Retry save action.
    expect(await screen.findByText(/Couldn't save your results/)).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry save" });

    fireEvent.click(retry);

    // The retry re-posts the same attempt and the mastery change appears.
    await waitFor(() => expect(screen.getByText("58%")).toBeTruthy());
    expect(screen.queryByText(/Couldn't save your results/)).toBeNull();
    expect(mockApi.submitLessonAttempt).toHaveBeenCalledTimes(2);
  });

  it("generates the lesson on first open when none is cached", async () => {
    mockApi.fetchLesson.mockResolvedValue({ lesson: null });
    mockApi.generateLesson.mockResolvedValue({ jobId: 7 });
    mockApi.fetchLessonJob.mockResolvedValue({
      status: "done",
      error: null,
      lesson: LESSON,
    });

    render(<Lesson topicId={10} pollIntervalMs={10} />);

    // Once the job is done, the reading view appears.
    expect(await screen.findByText("Subjuntivo: emoción")).toBeTruthy();
    expect(mockApi.generateLesson).toHaveBeenCalledWith(10);
  });

  it("shows 'Add a note' affordance after grading a lesson question", async () => {
    mockApi.fetchLesson.mockResolvedValue({ lesson: LESSON });
    mockApi.answerLesson.mockResolvedValue({
      verdict: "correct",
      correctAnswer: "Espero que tengas razón.",
      explanation: "Hope triggers the subjunctive.",
      feedback: null,
    });
    mockApi.submitLessonAttempt.mockResolvedValue({
      id: 5,
      masteryBefore: 0.4,
      mastery: 0.58,
    });

    render(<Lesson topicId={10} />);
    fireEvent.click(await screen.findByRole("button", { name: "Take the quiz" }));
    fireEvent.click(await screen.findByText("Espero que tengas razón."));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Correct.");

    // Note affordance appears after grading.
    expect(screen.getByRole("button", { name: "Add a note" })).toBeTruthy();
  });

  it("shows a retry when generation fails", async () => {
    mockApi.fetchLesson.mockResolvedValue({ lesson: null });
    mockApi.generateLesson.mockResolvedValue({ jobId: 7 });
    mockApi.fetchLessonJob.mockResolvedValue({
      status: "failed",
      error: "boom",
      lesson: null,
    });

    render(<Lesson topicId={10} pollIntervalMs={10} />);

    expect(
      await screen.findByText(/The lesson didn't finish/),
    ).toBeTruthy();
  });
});
