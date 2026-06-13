// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import type { ProgressSummary } from "@estudio/shared";
import "../test/setup";

vi.mock("./progressApi", () => ({
  fetchProgress: vi.fn(),
}));

import { Progress } from "./Progress";
import * as api from "./progressApi";

const mockApi = api as unknown as {
  fetchProgress: ReturnType<typeof vi.fn>;
};

const MOCK_DATA: ProgressSummary = {
  counts: { new: 94, learning: 257, mature: 61 },
  dueForecast: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-06-${(13 + i).toString().padStart(2, "0")}`,
    count: i === 0 ? 8 : i * 2,
  })),
  quizAccuracy: {
    sessions: [80, 75, 90, 85, 88],
    average: 84,
  },
  coverage: [
    { sourceId: 1, title: "Moby-Dick", triagedPct: 38, wordsKept: 122 },
    { sourceId: 2, title: "Workbook", triagedPct: 100, wordsKept: 208 },
  ],
};

const EMPTY_DATA: ProgressSummary = {
  counts: { new: 0, learning: 0, mature: 0 },
  dueForecast: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-06-${(13 + i).toString().padStart(2, "0")}`,
    count: 0,
  })),
  quizAccuracy: { sessions: [], average: null },
  coverage: [],
};

beforeEach(() => {
  mockApi.fetchProgress.mockReset();
});

describe("Progress screen", () => {
  it("renders all four data regions with seeded data", async () => {
    mockApi.fetchProgress.mockResolvedValue(MOCK_DATA);
    render(<Progress />);

    // 1. Counts
    expect(await screen.findByText("94")).toBeTruthy();
    expect(screen.getByText("257")).toBeTruthy();
    expect(screen.getByText("61")).toBeTruthy();
    expect(screen.getByText("new")).toBeTruthy();
    expect(screen.getByText("learning")).toBeTruthy();
    expect(screen.getByText("mature")).toBeTruthy();

    // 2. Forecast chart container
    expect(
      screen.getByRole("img", { name: "Due, next 14 days" }),
    ).toBeTruthy();

    // 3. Accuracy sentence
    expect(screen.getByText(/Last 20 sessions · 84% average/)).toBeTruthy();

    // 4. Coverage rows
    expect(screen.getByText("Moby-Dick")).toBeTruthy();
    expect(screen.getByText("Workbook")).toBeTruthy();

    // 5. Footer link
    expect(screen.getByRole("link", { name: /Spend, jobs/ })).toBeTruthy();
  });

  it("shows empty-state invitation when library has no words", async () => {
    mockApi.fetchProgress.mockResolvedValue(EMPTY_DATA);
    render(<Progress />);

    await waitFor(() => {
      // All counts at 0 (rendered by ProgressStat)
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });

    // EmptyState invitation
    expect(screen.getByText(/No words yet/)).toBeTruthy();

    // Accuracy shows em-dash when sessions is empty
    expect(screen.getByText(/Last 20 sessions · — average/)).toBeTruthy();
  });

  it("shows loading state (em-dashes) before data arrives", () => {
    mockApi.fetchProgress.mockReturnValue(new Promise(() => {}));
    render(<Progress />);

    // Counts not yet visible
    expect(screen.queryByText("94")).toBeNull();
    // Section headings are visible
    expect(screen.getByText("Due, next 14 days")).toBeTruthy();
    expect(screen.getByText("Quiz accuracy")).toBeTruthy();
  });

  it("shows per-section error state on fetch failure", async () => {
    mockApi.fetchProgress.mockRejectedValue(new Error("network error"));
    render(<Progress />);

    await waitFor(() => {
      const errors = screen.getAllByText(/Couldn't compute/);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it("shows All sources → when coverage has more than 6 entries", async () => {
    const manyBooks: ProgressSummary = {
      ...MOCK_DATA,
      coverage: Array.from({ length: 9 }, (_, i) => ({
        sourceId: i + 1,
        title: `Book ${i + 1}`,
        triagedPct: 50,
        wordsKept: 10,
      })),
    };
    mockApi.fetchProgress.mockResolvedValue(manyBooks);
    render(<Progress />);

    await screen.findByText("Book 1");

    // Only 5 visible initially (overflow threshold > 6, shows 5)
    expect(screen.queryByText("Book 6")).toBeNull();
    expect(screen.getByText(/All sources →/)).toBeTruthy();

    // Click to expand
    fireEvent.click(screen.getByText(/All sources →/));
    expect(await screen.findByText("Book 6")).toBeTruthy();
  });
});
