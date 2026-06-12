// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { OverviewSummary } from "@estudio/shared";
import "../test/setup";
import type { OverviewState } from "../components";
import { Home } from "./Home";

function summary(over: Partial<OverviewSummary> = {}): OverviewSummary {
  return {
    featured: {
      word: {
        id: 1,
        headword: "vergüenza",
        lemma: null,
        language: "ES",
        partOfSpeech: "sustantivo",
        level: "C1",
        glossEs: "sentimiento de culpa",
        glossEn: "shame",
        example: "Sentí vergüenza.",
      },
      reason: "due",
      lastReviewedAt: null,
    },
    review: { due: 23, newToday: 4 },
    library: { total: 412, mature: 61 },
    grammar: { topics: 8, belowFifty: 3, seeded: true },
    suggestions: { pool: 0 },
    recentWords: [],
    latestJob: null,
    lastBackupAt: "2026-06-11T00:00:00Z",
    ...over,
  };
}

function loaded(over: Partial<OverviewSummary> = {}): OverviewState {
  return { summary: summary(over), loading: false };
}

describe("Home", () => {
  it("renders the featured word as the hero centerpiece with its provenance", () => {
    render(<Home overview={loaded()} />);
    expect(
      screen.getByRole("heading", { name: "vergüenza" }),
    ).toBeTruthy();
    // The full entry's gloss and the provenance line both render.
    expect(screen.getByText("shame")).toBeTruthy();
    expect(screen.getByText("from your library · due today")).toBeTruthy();
    // Primary action + due-count sentence.
    expect(screen.getByRole("button", { name: "Start review" })).toBeTruthy();
    expect(screen.getByText("23 due today")).toBeTruthy();
  });

  it("swaps to a quiz prompt when nothing is due", () => {
    render(
      <Home
        overview={loaded({ review: { due: 0, newToday: 0 } })}
      />,
    );
    expect(screen.getByRole("button", { name: "Start a quiz" })).toBeTruthy();
    expect(screen.getByText("nothing due — keep it warm")).toBeTruthy();
  });

  it("shows the fresh-install EmptyState centerpiece when the library is empty", () => {
    render(
      <Home
        overview={loaded({
          featured: null,
          review: { due: 0, newToday: 0 },
          library: { total: 0, mature: 0 },
          grammar: { topics: 0, belowFifty: 0, seeded: false },
        })}
      />,
    );
    expect(
      screen.getByText(
        "Your dictionary is empty. Add a PDF or paste text to begin.",
      ),
    ).toBeTruthy();
    // No hero headword in the fresh state.
    expect(screen.queryByRole("heading", { name: "vergüenza" })).toBeNull();
  });

  it("links every overview-grid card to its route", () => {
    render(<Home overview={loaded()} />);
    expect(screen.getByRole("link", { name: /Review/ }).getAttribute("href")).toBe(
      "/review",
    );
    expect(screen.getByRole("link", { name: /Library/ }).getAttribute("href")).toBe(
      "/library",
    );
    expect(screen.getByRole("link", { name: /Grammar/ }).getAttribute("href")).toBe(
      "/grammar",
    );
    expect(screen.getByRole("link", { name: /Ingest/ }).getAttribute("href")).toBe(
      "/ingest",
    );
    // Suggestions hides while the pool is empty (Phase 2).
    expect(screen.queryByRole("link", { name: /Suggestions/ })).toBeNull();
  });

  it("renders the loading state with em-dash placeholders and no layout shift", () => {
    const { container } = render(<Home overview={{ loading: true }} />);
    // Hero headword reserves height as an em-dash.
    const heading = screen.getByRole("heading");
    expect(heading.textContent).toBe("—");
    // Count-bearing cards show the em-dash, still linking out.
    const review = screen.getByRole("link", { name: /Review/ });
    expect(within(review).getByText("—")).toBeTruthy();
    expect(container.querySelector(".home__grid")).toBeTruthy();
  });

  it("surfaces a recent-activity row and a job line when present", () => {
    render(
      <Home
        overview={loaded({
          recentWords: [
            { id: 9, headword: "madrugar", lemma: null, level: "B2", glossEn: "to get up early" },
          ],
          latestJob: { type: "text_ingestion", status: "running" },
        })}
      />,
    );
    expect(screen.getByText("madrugar")).toBeTruthy();
    expect(screen.getByText("Ingesting text")).toBeTruthy();
  });
});
