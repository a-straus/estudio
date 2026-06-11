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

import { Lesson } from "./Lesson";
import * as api from "./grammarApi";

const mockApi = api as unknown as {
  fetchLesson: ReturnType<typeof vi.fn>;
  generateLesson: ReturnType<typeof vi.fn>;
  fetchLessonJob: ReturnType<typeof vi.fn>;
  answerLesson: ReturnType<typeof vi.fn>;
  submitLessonAttempt: ReturnType<typeof vi.fn>;
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
});

describe("Lesson screen", () => {
  it("reads a cached lesson, then quizzes with an explain-why reveal", async () => {
    mockApi.fetchLesson.mockResolvedValue({ lesson: LESSON });
    mockApi.answerLesson.mockResolvedValue({
      correct: true,
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

    // Explain-why reveal appears after answering.
    expect(
      await screen.findByText("Hope triggers the subjunctive."),
    ).toBeTruthy();
    expect(screen.getByText("Correct.")).toBeTruthy();

    // Finish → results with score and the mastery change.
    fireEvent.click(screen.getByRole("button", { name: "See results" }));
    expect(await screen.findByText("1 of 1")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/40%/)).toBeTruthy(),
    );
    expect(screen.getByText("58%")).toBeTruthy();
    expect(mockApi.submitLessonAttempt).toHaveBeenCalledWith({
      topicId: 10,
      answers: [{ questionId: 100, given: "Espero que tengas razón.", correct: true }],
    });
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
