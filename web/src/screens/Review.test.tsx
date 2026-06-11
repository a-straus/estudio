// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DueQueueItem } from "@estudio/shared";
import "../test/setup";

vi.mock("./reviewApi", () => ({
  ApiError: class extends Error {},
  fetchDueQueue: vi.fn(),
  submitReview: vi.fn(),
}));

import { buildChoiceOptions, Review } from "./Review";
import * as api from "./reviewApi";

const mockApi = api as unknown as {
  fetchDueQueue: ReturnType<typeof vi.fn>;
  submitReview: ReturnType<typeof vi.fn>;
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
});

describe("Review screen", () => {
  it("fetches the due queue and renders the first card", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    render(<Review deckId={1} />);

    expect(await screen.findByText("arpón")).toBeTruthy();
    expect(screen.getByText("Choose the definition.")).toBeTruthy();
    expect(screen.getByText("1 of 4")).toBeTruthy();
    expect(mockApi.fetchDueQueue).toHaveBeenCalledWith(1);
  });

  it("submits a grade for the chosen multiple-choice answer", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(fourCardQueue());
    render(<Review deckId={1} />);

    // The correct option for a w2d card is the card's own English meaning.
    fireEvent.click(await screen.findByText("meaning of arpón"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));

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
    render(<Review deckId={1} />);

    fireEvent.click(await screen.findByText("meaning of arpón"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));

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
    render(<Review deckId={1} />);

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
    render(<Review deckId={1} />);

    await screen.findByText("arpón");
    expect(screen.queryByRole("button", { name: "I forgot this" })).toBeNull();
    // The single quiet pre-answer action is "Don't know".
    expect(screen.getByRole("button", { name: "Don’t know" })).toBeTruthy();
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
    render(<Review deckId={1} />);

    // Multiple choice, not flip: 1 queue distractor + 2 deck distractors.
    fireEvent.click(await screen.findByText("meaning of arpón"));
    expect(screen.getByText("meaning of casa")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Flip to check" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));

    await waitFor(() =>
      expect(mockApi.submitReview).toHaveBeenCalledWith({
        wordId: 1,
        direction: "w2d",
        grade: "good",
      }),
    );
  });

  it("shows the empty state when nothing is due", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(queue([]));
    render(<Review deckId={1} />);

    expect(await screen.findByText(/Nothing due/)).toBeTruthy();
  });

  it("shows the end-of-session summary after the last card", async () => {
    mockApi.fetchDueQueue.mockResolvedValue(
      queue([due({ wordId: 1, term: "arpón" })]),
    );
    render(<Review deckId={1} />);

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
