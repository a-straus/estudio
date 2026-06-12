// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type {
  SuggestionNextResponse,
  SuggestionDecisionResponse,
} from "@estudio/shared";
import "../test/setup";

vi.mock("./suggestionsApi", () => ({
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  fetchNextSuggestion: vi.fn(),
  recordDecision: vi.fn(),
}));

import { Suggestions } from "./Suggestions";
import * as api from "./suggestionsApi";

const mockApi = api as unknown as {
  fetchNextSuggestion: ReturnType<typeof vi.fn>;
  recordDecision: ReturnType<typeof vi.fn>;
};

function wordResponse(over?: object): SuggestionNextResponse {
  return {
    suggestion: {
      type: "word",
      id: 1,
      headword: "desenvolverse",
      lemma: "desenvolverse",
      language: "es",
      partOfSpeech: "verbo",
      level: "C1",
      glossEs: "manejarse bien en una situación",
      glossEn: "to get along, to cope",
      example: "Sabe desenvolverse solo.",
      reason: "near your level",
      ...over,
    },
    tally: { suggested: 1, added: 0, skipped: 0 },
  };
}

function topicResponse(): SuggestionNextResponse {
  return {
    suggestion: {
      type: "grammar_topic",
      id: 2,
      topicId: 42,
      name: "Por y para",
      preview: "Covers the distinction between por and para.",
      reason: "mastery 0.0",
    },
    tally: { suggested: 1, added: 0, skipped: 0 },
  };
}

function emptyResponse(): SuggestionNextResponse {
  return { suggestion: null, tally: { suggested: 5, added: 3, skipped: 2 } };
}

const OK: SuggestionDecisionResponse = { ok: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.fetchNextSuggestion.mockResolvedValue(wordResponse());
  mockApi.recordDecision.mockResolvedValue(OK);
});

describe("Suggestions screen", () => {
  it("shows tally and word card on load", async () => {
    render(<Suggestions />);
    await waitFor(() => expect(screen.getByTestId("tally")).toBeTruthy());
    expect(screen.getByTestId("tally").textContent).toMatch(/1 suggested/i);
    expect(screen.getByText("desenvolverse")).toBeTruthy();
    expect(screen.getByText(/ES · VERBO · C1/i)).toBeTruthy();
  });

  it("shows topic card for grammar_topic type", async () => {
    mockApi.fetchNextSuggestion.mockResolvedValue(topicResponse());
    render(<Suggestions />);
    await waitFor(() => expect(screen.getByText("Por y para")).toBeTruthy());
    expect(screen.getByText(/Covers the distinction between por/i)).toBeTruthy();
    expect(screen.getByText(/mastery 0\.0/i)).toBeTruthy();
  });

  it("shows empty state when pool is exhausted", async () => {
    mockApi.fetchNextSuggestion.mockResolvedValue(emptyResponse());
    render(<Suggestions />);
    await waitFor(() =>
      expect(screen.getByText(/Nothing left to suggest/i)).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /Go to Today/i })).toBeTruthy();
  });

  it("Add button calls recordDecision with 'add'", async () => {
    // After Add, return empty so the test settles.
    mockApi.fetchNextSuggestion
      .mockResolvedValueOnce(wordResponse())
      .mockResolvedValue(emptyResponse());

    render(<Suggestions />);
    const addBtn = await waitFor(() => {
      const btn = screen.getByTestId("add-btn");
      if ((btn as HTMLButtonElement).disabled) throw new Error("still loading");
      return btn;
    });

    await act(async () => {
      addBtn.click();
    });

    expect(mockApi.recordDecision).toHaveBeenCalledWith(1, "add");
  });

  it("Skip button calls recordDecision with 'skip'", async () => {
    mockApi.fetchNextSuggestion
      .mockResolvedValueOnce(wordResponse())
      .mockResolvedValue(emptyResponse());

    render(<Suggestions />);
    const skipBtn = await waitFor(() => {
      const btn = screen.getByTestId("skip-btn");
      if ((btn as HTMLButtonElement).disabled) throw new Error("still loading");
      return btn;
    });

    await act(async () => {
      skipBtn.click();
    });

    expect(mockApi.recordDecision).toHaveBeenCalledWith(1, "skip");
  });

  it("shows 'Choosing the next one…' while loading", async () => {
    // Never resolves so loading state persists.
    mockApi.fetchNextSuggestion.mockReturnValue(new Promise(() => {}));
    render(<Suggestions />);
    expect(screen.getByText(/Choosing the next one/i)).toBeTruthy();
  });

  it("shows error state and Retry button on fetch failure", async () => {
    mockApi.fetchNextSuggestion.mockRejectedValue(new Error("network error"));
    render(<Suggestions />);
    await waitFor(() =>
      expect(screen.getByText(/Couldn't pick a suggestion/i)).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /Retry/i })).toBeTruthy();
  });
});
