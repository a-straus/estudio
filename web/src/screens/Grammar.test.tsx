// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  GrammarHomeResponse,
  GrammarTopicView,
  JobView,
} from "@estudio/shared";
import "../test/setup";

vi.mock("./grammarApi", () => ({
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  fetchGrammar: vi.fn(),
  seedGrammar: vi.fn(),
  fetchJobs: vi.fn(),
}));

import { Grammar } from "./Grammar";
import * as api from "./grammarApi";

const mockApi = api as unknown as {
  fetchGrammar: ReturnType<typeof vi.fn>;
  seedGrammar: ReturnType<typeof vi.fn>;
  fetchJobs: ReturnType<typeof vi.fn>;
};

function topic(over: Partial<GrammarTopicView> & { id: number; name: string }) {
  return {
    categoryId: 1,
    description: "desc",
    mastery: 0,
    quizCount: 0,
    seenInLessons: 0,
    ...over,
  } satisfies GrammarTopicView;
}

function job(over: Partial<JobView> & { id: number }): JobView {
  return {
    type: "grammar_seed",
    payload: {},
    status: "running",
    progress: null,
    error: null,
    attempts: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const POPULATED: GrammarHomeResponse = {
  seeded: true,
  categories: [
    {
      id: 1,
      name: "Subjuntivo",
      sortOrder: 0,
      topics: [
        topic({ id: 10, name: "Emoción", mastery: 0.8, quizCount: 2 }),
        topic({ id: 11, name: "Cláusulas si" }),
      ],
    },
  ],
  practiceQueue: [topic({ id: 11, name: "Cláusulas si" })],
};

beforeEach(() => {
  mockApi.fetchGrammar.mockReset();
  mockApi.seedGrammar.mockReset();
  mockApi.fetchJobs.mockReset();
  mockApi.fetchJobs.mockResolvedValue([]);
});

describe("Grammar screen", () => {
  it("renders categories, topics, mastery, and the practice queue", async () => {
    mockApi.fetchGrammar.mockResolvedValue(POPULATED);

    render(<Grammar />);

    expect(await screen.findByText("Subjuntivo")).toBeTruthy();
    // Practice queue header + a queued low-mastery topic.
    expect(screen.getByText("PRACTICE NEXT")).toBeTruthy();
    // Mastery meta: a quizzed topic shows count + percent; an untouched one "unread".
    expect(screen.getByText("quizzed twice · 80%")).toBeTruthy();
    expect(screen.getAllByText("unread").length).toBeGreaterThan(0);
    // Topics link into their lesson.
    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/grammar/topics/10/lesson");
    expect(link).toBeTruthy();
  });

  it("offers seeding from the empty state and reloads when the job finishes", async () => {
    mockApi.fetchGrammar
      .mockResolvedValueOnce({
        seeded: false,
        categories: [],
        practiceQueue: [],
      })
      .mockResolvedValue(POPULATED);
    mockApi.seedGrammar.mockResolvedValue({ jobId: 7 });
    mockApi.fetchJobs.mockResolvedValue([job({ id: 7, status: "done" })]);

    render(<Grammar pollIntervalMs={10} />);

    const seedBtn = await screen.findByRole("button", {
      name: "Seed the curriculum",
    });
    fireEvent.click(seedBtn);

    expect(mockApi.seedGrammar).toHaveBeenCalledTimes(1);
    // Once the job is done the screen reloads into the populated curriculum.
    expect(await screen.findByText("Subjuntivo")).toBeTruthy();
  });

  it("shows seeding progress while the job runs", async () => {
    mockApi.fetchGrammar.mockResolvedValue({
      seeded: false,
      categories: [],
      practiceQueue: [],
    });
    mockApi.seedGrammar.mockResolvedValue({ jobId: 7 });
    mockApi.fetchJobs.mockResolvedValue([job({ id: 7, status: "running" })]);

    render(<Grammar pollIntervalMs={10} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Seed the curriculum" }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Building your grammar curriculum/)).toBeTruthy(),
    );
  });

  it("shows curriculum counts once the seed job streams its writing phase", async () => {
    mockApi.fetchGrammar.mockResolvedValue({
      seeded: false,
      categories: [],
      practiceQueue: [],
    });
    mockApi.seedGrammar.mockResolvedValue({ jobId: 7 });
    mockApi.fetchJobs.mockResolvedValue([
      job({
        id: 7,
        status: "running",
        progress: { phase: "writing", categories: 5, topics: 30 },
      }),
    ]);

    render(<Grammar pollIntervalMs={10} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Seed the curriculum" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Writing 5 categories · 30 topics…"),
      ).toBeTruthy(),
    );
  });

  it("surfaces a load error with a reload action", async () => {
    mockApi.fetchGrammar.mockRejectedValue(new Error("boom"));

    render(<Grammar />);

    expect(await screen.findByText(/boom/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});
