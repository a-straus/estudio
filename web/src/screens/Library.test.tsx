// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import type { WordDetailResponse, WordListItem } from "@estudio/shared";
import "../test/setup";

vi.mock("./libraryApi", () => ({
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  fetchWords: vi.fn(),
  fetchWord: vi.fn(),
  createWord: vi.fn(),
  updateWord: vi.fn(),
  deleteWord: vi.fn(),
  demoteWord: vi.fn(),
}));

import { Library } from "./Library";
import * as api from "./libraryApi";

const mockApi = api as unknown as {
  fetchWords: ReturnType<typeof vi.fn>;
  fetchWord: ReturnType<typeof vi.fn>;
  createWord: ReturnType<typeof vi.fn>;
  updateWord: ReturnType<typeof vi.fn>;
  deleteWord: ReturnType<typeof vi.fn>;
  demoteWord: ReturnType<typeof vi.fn>;
};

function item(
  over: Partial<WordListItem> & { id: number; term: string },
): WordListItem {
  return {
    lemma: null,
    language: "es",
    partOfSpeech: "sustantivo",
    definitionEs: null,
    definitionEn: `meaning of ${over.term}`,
    example: null,
    level: "B1",
    status: "new",
    deckId: 1,
    sourceId: null,
    ...over,
  };
}

function detail(
  over: Partial<WordDetailResponse> & { id: number; term: string },
): WordDetailResponse {
  return {
    ...item(over),
    definitionOrigin: "llm",
    ownerEditedAt: null,
    promptVersion: "abc123",
    sourceTitle: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    cardState: null,
    recentReviews: [],
    ...over,
  };
}

function listResponse(items: WordListItem[]) {
  return { items, total: items.length, limit: 50, offset: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.fetchWords.mockResolvedValue(
    listResponse([
      item({ id: 1, term: "desasosiego" }),
      item({ id: 2, term: "vergüenza" }),
    ]),
  );
});

describe("Library screen", () => {
  it("loads and renders the word list", async () => {
    render(<Library />);
    expect(await screen.findByText("desasosiego")).toBeTruthy();
    expect(screen.getByText("vergüenza")).toBeTruthy();
  });

  it("shows the empty state when there are no words", async () => {
    mockApi.fetchWords.mockResolvedValue(listResponse([]));
    render(<Library />);
    expect(
      await screen.findByText(
        "No words yet. Ingest something, or add one by hand.",
      ),
    ).toBeTruthy();
  });

  it("searches: typing refetches with the q param", async () => {
    render(<Library />);
    await screen.findByText("desasosiego");

    mockApi.fetchWords.mockResolvedValue(
      listResponse([item({ id: 1, term: "más", definitionEn: "more" })]),
    );
    fireEvent.change(screen.getByLabelText("Search words"), {
      target: { value: "mas" },
    });

    await waitFor(() =>
      expect(
        mockApi.fetchWords.mock.calls.some(
          (c) => (c[0] as { q?: string }).q === "mas",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("más")).toBeTruthy();
  });

  it("shows an error state and can reload", async () => {
    mockApi.fetchWords.mockRejectedValueOnce(new Error("network down"));
    render(<Library />);
    expect(await screen.findByText(/network down/)).toBeTruthy();

    mockApi.fetchWords.mockResolvedValue(
      listResponse([item({ id: 1, term: "casa", definitionEn: "house" })]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("casa")).toBeTruthy();
  });

  it("opens a word's detail when its row is clicked", async () => {
    mockApi.fetchWord.mockResolvedValue(
      detail({ id: 1, term: "desasosiego", definitionEn: "restlessness" }),
    );
    render(<Library />);
    fireEvent.click(await screen.findByText("desasosiego"));

    const panel = await screen.findByRole("region", { name: "Word detail" });
    expect(mockApi.fetchWord).toHaveBeenCalledWith(1);
    expect(within(panel).getByText("restlessness")).toBeTruthy();
  });

  it("adds a word through the add form", async () => {
    mockApi.createWord.mockResolvedValue(
      detail({ id: 9, term: "añoranza", definitionEn: "longing" }),
    );
    mockApi.fetchWord.mockResolvedValue(
      detail({ id: 9, term: "añoranza", definitionEn: "longing" }),
    );
    render(<Library />);
    await screen.findByText("desasosiego");

    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    fireEvent.change(screen.getByLabelText("Word"), {
      target: { value: "añoranza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save word" }));

    await waitFor(() =>
      expect(mockApi.createWord).toHaveBeenCalledWith(
        expect.objectContaining({ term: "añoranza", language: "es" }),
      ),
    );
  });

  it("surfaces an auto-fill failure inline and keeps the form usable", async () => {
    const { ApiError } = api as unknown as {
      ApiError: new (m: string, c: string) => Error;
    };
    mockApi.createWord.mockRejectedValue(
      new ApiError("Couldn't auto-fill the definition", "llm_failed"),
    );
    render(<Library />);
    await screen.findByText("desasosiego");

    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    fireEvent.change(screen.getByLabelText("Word"), {
      target: { value: "inefable" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save word" }));

    expect(
      await screen.findByText(
        "Couldn't auto-fill. Write the definition, or retry.",
      ),
    ).toBeTruthy();
  });

  describe("pagination", () => {
    function multiPageResponse(offset = 0) {
      return {
        items: [
          item({ id: 1, term: "desasosiego" }),
          item({ id: 2, term: "vergüenza" }),
        ],
        total: 100,
        limit: 50,
        offset,
      };
    }

    it("renders the pager when total > limit", async () => {
      mockApi.fetchWords.mockResolvedValue(multiPageResponse());
      render(<Library />);
      await screen.findByText("desasosiego");
      expect(screen.getByRole("navigation", { name: "Page navigation" })).toBeTruthy();
      expect(screen.getByText("1–50 of 100 words")).toBeTruthy();
    });

    it("does not render the pager when total <= limit", async () => {
      render(<Library />);
      await screen.findByText("desasosiego");
      expect(
        screen.queryByRole("navigation", { name: "Page navigation" }),
      ).toBeNull();
    });

    it("clicking Next requests the next page", async () => {
      mockApi.fetchWords.mockResolvedValue(multiPageResponse());
      render(<Library />);
      await screen.findByText("desasosiego");

      mockApi.fetchWords.mockResolvedValue(multiPageResponse(50));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Next ›" }));
      });

      await waitFor(() =>
        expect(
          mockApi.fetchWords.mock.calls.some(
            (c) => (c[0] as { offset?: number }).offset === 50,
          ),
        ).toBe(true),
      );
    });

    it("changing a filter resets to page 1", async () => {
      mockApi.fetchWords.mockResolvedValue(multiPageResponse());
      render(<Library />);
      await screen.findByText("desasosiego");

      // Navigate to page 2
      mockApi.fetchWords.mockResolvedValue(multiPageResponse(50));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Next ›" }));
      });
      await waitFor(() =>
        expect(
          mockApi.fetchWords.mock.calls.some(
            (c) => (c[0] as { offset?: number }).offset === 50,
          ),
        ).toBe(true),
      );

      // Change the deck filter — should reset offset to 0
      mockApi.fetchWords.mockResolvedValue(multiPageResponse(0));
      const callsBefore = mockApi.fetchWords.mock.calls.length;
      fireEvent.click(screen.getByRole("radio", { name: "EN" }));

      await waitFor(() => {
        const newCalls = mockApi.fetchWords.mock.calls.slice(callsBefore);
        return expect(
          newCalls.some(
            (c) =>
              (c[0] as { offset?: number }).offset === 0 &&
              (c[0] as { deckId?: number }).deckId === 2,
          ),
        ).toBe(true);
      });
    });
  });
});
