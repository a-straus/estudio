// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type {
  LessonListItem,
  LessonRecordingView,
} from "@estudio/shared";
import "../test/setup";

vi.mock("./lessonsApi", () => ({
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  fetchLessons: vi.fn(),
  fetchLesson: vi.fn(),
}));

import { Lessons } from "./Lessons";
import * as api from "./lessonsApi";

const mockApi = api as unknown as {
  fetchLessons: ReturnType<typeof vi.fn>;
  fetchLesson: ReturnType<typeof vi.fn>;
};

function lessonRow(over: Partial<LessonListItem> = {}): LessonListItem {
  return {
    sourceId: 1,
    title: "Lesson Jun 9",
    createdAt: "2026-06-09T10:00:00Z",
    durationMinutes: null,
    jobStatus: "done",
    jobPhase: "done",
    jobError: null,
    flaggedWordCount: 4,
    correctionCount: 6,
    struggleSentenceCount: 0,
    topicCount: 3,
    ...over,
  };
}

function lessonDetail(sourceId = 1): LessonRecordingView {
  return {
    source: {
      id: sourceId,
      type: "lesson_audio",
      title: "Lesson Jun 9",
      ref: "lesson.m4a",
      storedPath: null,
      transcript: "Hola, ¿cómo estás?",
      createdAt: "2026-06-09T10:00:00Z",
      updatedAt: "2026-06-09T10:00:00Z",
    },
    insights: {
      flaggedWords: [
        {
          id: 1,
          sourceId,
          type: "flagged_word",
          payload: {
            term: "entender",
            lemma: null,
            partOfSpeech: null,
            definitionEs: null,
            definitionEn: "to understand",
          },
          wordId: null,
          topicId: null,
          createdAt: "2026-06-09T10:00:00Z",
          updatedAt: "2026-06-09T10:00:00Z",
          wordStatus: null,
        },
      ],
      corrections: [
        {
          id: 2,
          sourceId,
          type: "correction",
          payload: {
            said: "yo fui ayer en",
            corrected: "yo fui ayer a",
            note: null,
          },
          wordId: null,
          topicId: null,
          createdAt: "2026-06-09T10:00:00Z",
          updatedAt: "2026-06-09T10:00:00Z",
        },
      ],
      struggleSentences: [],
      topicsCovered: [
        {
          id: 3,
          sourceId,
          type: "topic_covered",
          payload: { name: "Subjuntivo" },
          wordId: null,
          topicId: 5,
          createdAt: "2026-06-09T10:00:00Z",
          updatedAt: "2026-06-09T10:00:00Z",
        },
      ],
    },
  };
}

beforeEach(() => {
  mockApi.fetchLessons.mockReset();
  mockApi.fetchLesson.mockReset();
});

describe("Lessons — empty state", () => {
  it("shows empty state when no lessons exist", async () => {
    mockApi.fetchLessons.mockResolvedValue([]);
    render(<Lessons />);
    await waitFor(() => {
      expect(
        screen.getByText(/No lessons yet/),
      ).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Go to Ingest" })).toBeTruthy();
  });
});

describe("Lessons — list", () => {
  it("renders list rows with title and summary", async () => {
    mockApi.fetchLessons.mockResolvedValue([lessonRow()]);
    render(<Lessons />);
    await waitFor(() => {
      expect(screen.getByText(/Lesson · Jun 9/)).toBeTruthy();
    });
    expect(screen.getByText(/4 flagged · 6 corrections · 3 topics/)).toBeTruthy();
  });

  it("rounds fractional durationMinutes to whole number in title", async () => {
    mockApi.fetchLessons.mockResolvedValue([lessonRow({ durationMinutes: 58.4333 })]);
    render(<Lessons />);
    await waitFor(() => {
      expect(screen.getByText(/· 58 min/)).toBeTruthy();
    });
    expect(screen.queryByText(/58\.4/)).toBeNull();
  });

  it("omits min segment when durationMinutes is null", async () => {
    mockApi.fetchLessons.mockResolvedValue([lessonRow({ durationMinutes: null })]);
    render(<Lessons />);
    await waitFor(() => {
      expect(screen.getByText(/Lesson · Jun 9/)).toBeTruthy();
    });
    expect(screen.queryByText(/min/)).toBeNull();
  });

  it("shows JobStatus for a processing lesson", async () => {
    mockApi.fetchLessons.mockResolvedValue([
      lessonRow({
        jobStatus: "running",
        jobPhase: "transcribing",
        flaggedWordCount: 0,
        correctionCount: 0,
        topicCount: 0,
      }),
    ]);
    render(<Lessons />);
    await waitFor(() => {
      expect(screen.getByText("Transcribing…")).toBeTruthy();
    });
  });
});

describe("Lessons — detail", () => {
  it("loads and renders detail on desktop row click", async () => {
    mockApi.fetchLessons.mockResolvedValue([lessonRow()]);
    mockApi.fetchLesson.mockResolvedValue(lessonDetail());

    // Mock window.matchMedia to return desktop (> 959px)
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    render(<Lessons />);
    await waitFor(() => screen.getByText(/Lesson · Jun 9/));

    fireEvent.click(screen.getByText(/Lesson · Jun 9/).closest("button")!);
    await waitFor(() => {
      expect(mockApi.fetchLesson).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.getByText("FLAGGED WORDS")).toBeTruthy();
    });
    expect(screen.getByText("CORRECTIONS")).toBeTruthy();
    expect(screen.getByText("TOPICS COVERED")).toBeTruthy();
    // Struggle section hidden when empty
    expect(screen.queryByText("STRUGGLE SENTENCES")).toBeNull();
  });

  it("collapses transcript behind a button", async () => {
    mockApi.fetchLessons.mockResolvedValue([lessonRow()]);
    mockApi.fetchLesson.mockResolvedValue(lessonDetail());
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    render(<Lessons />);
    await waitFor(() => screen.getByText(/Lesson · Jun 9/));
    fireEvent.click(screen.getByText(/Lesson · Jun 9/).closest("button")!);
    await waitFor(() => screen.getByText("FLAGGED WORDS"));

    expect(screen.queryByText("Hola, ¿cómo estás?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    expect(screen.getByText("Hola, ¿cómo estás?")).toBeTruthy();
  });
});
