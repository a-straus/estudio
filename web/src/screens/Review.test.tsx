// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DueQueueItem } from "@estudio/shared";
import "../test/setup";

vi.mock("./reviewApi", () => ({
  ApiError: class extends Error {},
  fetchDueQueue: vi.fn(),
  submitReview: vi.fn(),
}));

vi.mock("./systemApi", () => ({
  getSettings: vi.fn(),
  putSettings: vi.fn(),
}));

import { buildChoiceOptions, Review } from "./Review";
import * as api from "./reviewApi";
import * as sysApi from "./systemApi";

const mockApi = api as unknown as {
  fetchDueQueue: ReturnType<typeof vi.fn>;
  submitReview: ReturnType<typeof vi.fn>;
};

const mockSysApi = sysApi as unknown as {
  getSettings: ReturnType<typeof vi.fn>;
  putSettings: ReturnType<typeof vi.fn>;
};

function due(
  over: Partial<DueQueueItem> & { wordId: number; term: string },
): DueQueueItem {
  return {
    lemma: null,
    partOfSpeech: "sustantivo",
    definitionEs: `definición de ${over.term}`,
    definitionEn: `meaning of ${over.term}`,
    example: `un ejemplo con ${over.term}`,
    direction: "w2d",
    ...over,
  };
}

function queue(items: DueQueueItem[]) {
  return { deckId: 1, items };
}

// A four-card queue so w2d multiple-choice can build a full option set.
function fourCardQueue() {
  return queue([
    due({ wordId: 1, term: "arpón" }),
    due({ wordId: 2, term: "barco" }),
    due({ wordId: 3, term: "casa" }),
    due({ wordId: 4, term: "dato" }),
  ]);
}

const scheduled = {
  card: {
    wordId: 1,
    ease: 2.5,
    intervalDays: 1,
    dueAt: "2026-06-12T00:00:00Z",
    reps: 1,
    status: "learning" as const,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.submitReview.mockResolvedValue(scheduled);
  // Default: settings loads with mc format and "both" definitions.
  mockSysApi.getSettings.mockResolvedValue({
    settings: { definitionDisplay: "both", newCardsPerDay: 20, reviewFormat: "mc" },
  });
  mockSysApi.putSettings.mockResolvedValue({
    settings: { definitionDisplay: "both", newCardsPerDay: 20, reviewFormat: "mc" },
  });
});

/** Helper: render Review, wait for landing, then start the active run. */
async function startReview(deckId = 1) {
  render(<Review deckId={deckId} />);
  const startBtn = await screen.findByRole("button", { name: "Start review" });
  fireEvent.click(startBtn);
}

describe("Review landing", () => {
  it("shows the due count and a Start review button before entering the active run", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    render(<Review deckId={1} />);

    expect(await screen.findByText("4 cards due today")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start review" })).toBeTruthy();
    // Card content is not yet visible
    expect(screen.queryByText("arpón")).toBeNull();
  });

  it("shows empty state when nothing is due", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(queue([]));
    render(<Review deckId={1} />);

    expect(await screen.findByText(/Nothing due/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
  });

  it("entering Start review shows the first card", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    await startReview();

    expect(await screen.findByText("arpón")).toBeTruthy();
    expect(screen.getByText("1 of 4")).toBeTruthy();
  });

  it("End session (×) returns to the landing, not to /", async () => {
    // fetchDueQueue called twice: initial load + reload after endSession
    mockApi.fetchDueQueue
      .mockResolvedValueOnce(fourCardQueue())
      .mockResolvedValueOnce(fourCardQueue());
    await startReview();

    // Confirm we are in the active run
    await screen.findByText("arpón");

    // End session via the × button
    fireEvent.click(screen.getByRole("button", { name: "End session" }));

    // Landing should reappear
    expect(await screen.findByText(/cards due today/)).toBeTruthy();
    expect(screen.queryByText("arpón")).toBeNull();
  });
});

describe("Review screen", () => {
  it("fetches the due queue and renders the first card", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    await startReview();

    expect(await screen.findByText("arpón")).toBeTruthy();
    expect(screen.getByText("Choose the definition.")).toBeTruthy();
    expect(screen.getByText("1 of 4")).toBeTruthy();
    expect(mockApi.fetchDueQueue).toHaveBeenCalledWith(1);
  });

  it("submits a grade for the chosen multiple-choice answer", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    await startReview();

    // Selecting an option immediately grades — no "Check answer" step.
    expect(screen.queryByRole("button", { name: "Check answer" })).toBeNull();
    fireEvent.click(await screen.findByText("meaning of arpón"));

    await waitFor(() =>
      expect(mockApi.submitReview).toHaveBeenCalledWith({
        wordId: 1,
        direction: "w2d",
        grade: "good",
      }),
    );
    expect(screen.getByText("Correct.")).toBeTruthy();
  });

  it("reveals both definitions after answering", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    await startReview();

    // Selecting the correct option immediately reveals.
    fireEvent.click(await screen.findByText("meaning of arpón"));

    // Spanish definition line only appears in the reveal panel.
    expect(await screen.findByText("definición de arpón")).toBeTruthy();
    expect(screen.getByText("un ejemplo con arpón")).toBeTruthy();
  });

  it("falls back to a flip card when the queue is too small for options", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(
      queue([
        due({ wordId: 1, term: "arpón" }),
        due({ wordId: 2, term: "barco" }),
      ]),
    );
    await startReview();

    const flip = await screen.findByRole("button", { name: "Flip to check" });
    expect(screen.queryByRole("button", { name: "Check answer" })).toBeNull();

    fireEvent.click(flip);
    fireEvent.click(screen.getByRole("button", { name: "Knew it" }));

    await waitFor(() =>
      expect(mockApi.submitReview).toHaveBeenCalledWith({
        wordId: 1,
        direction: "w2d",
        grade: "good",
      }),
    );
  });

  it("offers no 'I forgot this' action — demotion lives in Library, not here", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    await startReview();

    await screen.findByText("arpón");
    expect(screen.queryByRole("button", { name: "I forgot this" })).toBeNull();
    // The single quiet pre-answer action is "Don't know" (apostrophe may be curly).
    expect(screen.getByRole("button", { name: /don.t know/i })).toBeTruthy();
  });

  it("uses deck distractors to build options when the queue is small", async () => {
    mockApi.fetchDueQueue.mockResolvedValue({
      ...queue([
        due({ wordId: 1, term: "arpón" }),
        due({ wordId: 2, term: "barco" }),
      ]),
      distractors: [
        { wordId: 11, term: "casa", definitionEn: "meaning of casa" },
        { wordId: 12, term: "dato", definitionEn: "meaning of dato" },
      ],
    });
    await startReview();

    // Multiple choice, not flip: 1 queue distractor + 2 deck distractors.
    // Selecting an option grades immediately — no "Check answer" button.
    await screen.findByText("meaning of arpón");
    expect(screen.getByText("meaning of casa")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Flip to check" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check answer" })).toBeNull();
    fireEvent.click(screen.getByText("meaning of arpón"));

    await waitFor(() =>
      expect(mockApi.submitReview).toHaveBeenCalledWith({
        wordId: 1,
        direction: "w2d",
        grade: "good",
      }),
    );
  });

  it("shows the end-of-session summary after the last card", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(
      queue([due({ wordId: 1, term: "arpón" })]),
    );
    await startReview();

    fireEvent.click(
      await screen.findByRole("button", { name: "Flip to check" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Knew it" }));

    expect(await screen.findByText("1 card · 1 correct")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("surfaces a load error per the contract microcopy", async () => {
    mockApi.fetchDueQueue.mockRejectedValue(new Error("boom"));
    render(<Review deckId={1} />);

    expect(await screen.findByText(/Couldn't load your decks/)).toBeTruthy();
  });
});

describe("Review autostart", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      search: "?autostart=1",
      assign: vi.fn(),
      href: "http://localhost/review?autostart=1",
      pathname: "/review",
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips the landing and enters the active run when autostart=1 and cards are due", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    render(<Review deckId={1} />);

    // The first card appears without clicking "Start review".
    expect(await screen.findByText("arpón")).toBeTruthy();
    expect(screen.queryByText("4 cards due today")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
  });

  it("shows the normal empty landing when autostart=1 but no cards are due", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(queue([]));
    render(<Review deckId={1} />);

    expect(await screen.findByText(/Nothing due/)).toBeTruthy();
    expect(screen.queryByText("arpón")).toBeNull();
  });
});

describe("Review no-autostart", () => {
  it("shows the landing page when there is no autostart param", async () => {
    // window.location.search is "" by default in jsdom.
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    render(<Review deckId={1} />);

    expect(await screen.findByText("4 cards due today")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start review" })).toBeTruthy();
    expect(screen.queryByText("arpón")).toBeNull();
  });
});

describe("buildChoiceOptions", () => {
  const cards = fourCardQueue().items;

  it("shuffles the correct option's slot instead of pinning it per card", () => {
    const card = cards[0];
    // Two rng streams that produce different permutations.
    const low = buildChoiceOptions(card, cards, "w2d", [], () => 0)!;
    const high = buildChoiceOptions(card, cards, "w2d", [], () => 0.999)!;

    for (const set of [low, high]) {
      expect(set.options).toHaveLength(4);
      expect(set.options.filter((o) => o === "meaning of arpón")).toHaveLength(
        1,
      );
      expect(set.options[set.correctIndex]).toBe("meaning of arpón");
    }
    expect(low.correctIndex).not.toBe(high.correctIndex);
  });

  it("pads with deck distractors and only returns null when both run dry", () => {
    const small = cards.slice(0, 2);
    const distractors = [
      { wordId: 11, term: "casa", definitionEn: "meaning of casa" },
      { wordId: 12, term: "dato", definitionEn: "meaning of dato" },
    ];
    const set = buildChoiceOptions(
      small[0],
      small,
      "w2d",
      distractors,
      () => 0,
    );
    expect(set).not.toBeNull();
    expect(set!.options).toContain("meaning of casa");

    // Queue of 2 with a single distractor → only 2 distractors → flip.
    expect(
      buildChoiceOptions(small[0], small, "w2d", distractors.slice(0, 1)),
    ).toBeNull();
  });
});

describe("Review yes/no format", () => {
  async function startYesNoReview() {
    mockSysApi.getSettings.mockResolvedValue({
      settings: {
        definitionDisplay: "both",
        newCardsPerDay: 20,
        reviewFormat: "yesno",
      },
    });
    mockApi.fetchDueQueue.mockResolvedValue(
      queue([due({ wordId: 1, term: "arpón" })]),
    );
    render(<Review deckId={1} />);
    const startBtn = await screen.findByRole("button", { name: "Start review" });
    fireEvent.click(startBtn);
    // Wait for the card to appear.
    await screen.findByText("arpón");
  }

  it("shows 'Tap to reveal' hint before reveal and no grade buttons", async () => {
    await startYesNoReview();
    expect(screen.getByText("Tap to reveal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Knew it" })).toBeNull();
    expect(screen.queryByRole("button", { name: /didn.t know/i })).toBeNull();
  });

  it("shows 'Didn't know' and 'Knew it' buttons after reveal", async () => {
    await startYesNoReview();
    // Tap the card to reveal.
    fireEvent.click(screen.getByText("Do you know it?"));
    expect(await screen.findByRole("button", { name: "Knew it" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /didn.t know/i })).toBeTruthy();
    expect(screen.queryByText("Tap to reveal")).toBeNull();
  });

  it("'Knew it' calls submitReview with grade 'good' and advances", async () => {
    await startYesNoReview();
    fireEvent.click(screen.getByText("Do you know it?"));
    fireEvent.click(await screen.findByRole("button", { name: "Knew it" }));
    await waitFor(() =>
      expect(mockApi.submitReview).toHaveBeenCalledWith({
        wordId: 1,
        direction: "w2d",
        grade: "good",
      }),
    );
    // One-card queue → advances to summary.
    expect(await screen.findByText(/1 card/)).toBeTruthy();
  });

  it("'Didn't know' calls submitReview with grade 'fail' and advances", async () => {
    await startYesNoReview();
    fireEvent.click(screen.getByText("Do you know it?"));
    fireEvent.click(
      await screen.findByRole("button", { name: /didn.t know/i }),
    );
    await waitFor(() =>
      expect(mockApi.submitReview).toHaveBeenCalledWith({
        wordId: 1,
        direction: "w2d",
        grade: "fail",
      }),
    );
  });

  it("landing shows the SegmentedControl with both format options", async () => {
    mockSysApi.getSettings.mockResolvedValue({
      settings: {
        definitionDisplay: "both",
        newCardsPerDay: 20,
        reviewFormat: "mc",
      },
    });
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    render(<Review deckId={1} />);
    await screen.findByText(/cards? due today/);
    expect(screen.getByRole("radio", { name: "Multiple choice" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Yes-No" })).toBeTruthy();
  });
});
