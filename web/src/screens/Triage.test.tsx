// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ConfirmResponse,
  ExtractionItemView,
  TriageBatchResponse,
} from "@estudio/shared";
import "../test/setup";

vi.mock("./triageApi", () => ({
  // Re-created here so `instanceof ApiError` in the screen matches errors we
  // throw from the mocked fetchBatch.
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  fetchBatch: vi.fn(),
  patchDecision: vi.fn(),
  bulkDecide: vi.fn(),
  confirmBatch: vi.fn(),
  resolveDedupe: vi.fn(),
}));

import { Triage } from "./Triage";
import * as api from "./triageApi";

const mockApi = api as unknown as {
  ApiError: new (message: string, code: string) => Error;
  fetchBatch: ReturnType<typeof vi.fn>;
  patchDecision: ReturnType<typeof vi.fn>;
  bulkDecide: ReturnType<typeof vi.fn>;
  confirmBatch: ReturnType<typeof vi.fn>;
  resolveDedupe: ReturnType<typeof vi.fn>;
};

let assignSpy: ReturnType<typeof vi.fn>;

function item(
  over: Partial<ExtractionItemView> & { id: number; term: string },
): ExtractionItemView {
  return {
    sourceId: 1,
    lemma: null,
    partOfSpeech: "sustantivo",
    definitionEs: null,
    definitionEn: `gloss of ${over.term}`,
    example: null,
    level: "C1",
    likelyKnown: 0.1,
    batchNo: 1,
    decision: "pending",
    decidedAt: null,
    wordId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function batch(
  items: ExtractionItemView[],
  over: Partial<TriageBatchResponse> = {},
): TriageBatchResponse {
  const tally = { know: 0, learn: 0, skip: 0, pending: 0 };
  for (const it of items) tally[it.decision] += 1;
  return {
    source: { id: 1, title: "Moby-Dick" },
    batchNo: 1,
    batchCount: 1,
    totalInBatch: items.length,
    sortedInBatch: items.filter((i) => i.decision !== "pending").length,
    items,
    tally,
    ...over,
  };
}

// PATCH echoes the item back with its new decision (decidedAt stays null —
// materialization only happens at confirm).
function patchEchoes(items: ExtractionItemView[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  mockApi.patchDecision.mockImplementation(
    async (id: number, decision: ExtractionItemView["decision"]) => ({
      ...byId.get(id)!,
      decision,
    }),
  );
}

const currentRow = () => document.querySelector(".triage-row--current");
const learnButton = () => screen.getByRole("button", { name: "Learn" });

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom implements neither of these; the screen calls both.
  Element.prototype.scrollIntoView = vi.fn();
  assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy, href: "http://localhost/triage?source=1" },
  });
});

describe("Triage layout", () => {
  it("groups undecided rows by likely-known prediction with per-group bulk actions", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([
        item({ id: 1, term: "arpón", likelyKnown: 0.1 }),
        item({ id: 2, term: "leeward", likelyKnown: 0.8 }),
      ]),
    );
    render(<Triage sourceId={1} />);

    expect(await screen.findByText(/PROBABLY NEW · 1/)).toBeTruthy();
    expect(screen.getByText(/YOU MAY KNOW THESE · 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Learn all 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Know all 1/ })).toBeTruthy();
    expect(screen.getByText(/Moby-Dick/)).toBeTruthy();
  });

  it("counts only still-undecided candidates in the group + bulk labels", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([
        item({ id: 1, term: "arpón", likelyKnown: 0.1 }),
        item({ id: 2, term: "barco", likelyKnown: 0.1, decision: "skip" }),
        item({ id: 3, term: "casa", likelyKnown: 0.1, decision: "know" }),
      ]),
    );
    render(<Triage sourceId={1} />);

    // 2 of 3 already decided by hand → only the 1 pending one is in the queue.
    expect(await screen.findByText(/PROBABLY NEW · 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Learn all 1/ })).toBeTruthy();
    // Decided words have left the visible queue.
    expect(screen.queryByText("barco")).toBeNull();
    expect(screen.queryByText("casa")).toBeNull();
  });
});

describe("Triage advancement (no skipped candidates)", () => {
  it("removes a decided word and advances to the very next candidate", async () => {
    const items = [
      item({ id: 1, term: "uno" }),
      item({ id: 2, term: "dos" }),
      item({ id: 3, term: "tres" }),
    ];
    mockApi.fetchBatch.mockResolvedValue(batch(items));
    patchEchoes(items);

    render(<Triage sourceId={1} />);

    await screen.findByText("uno");
    expect(currentRow()?.textContent).toContain("uno");

    // Decide the first as Learn → it leaves the queue and the SECOND becomes
    // current. The reported bug landed on "tres" here, skipping "dos".
    fireEvent.click(learnButton());
    await waitFor(() => expect(currentRow()?.textContent).toContain("dos"));
    expect(screen.queryByText("uno")).toBeNull();

    fireEvent.click(learnButton());
    await waitFor(() => expect(currentRow()?.textContent).toContain("tres"));

    fireEvent.click(learnButton());

    // Every candidate got a decision — none was passed over.
    await screen.findByText("Everything sorted", {}, { timeout: 4000 });
    expect(screen.getByRole("button", { name: /Keep 3 words/ })).toBeTruthy();
    expect(mockApi.patchDecision).toHaveBeenCalledTimes(3);
  });

  it("advances in flow order without skipping when server order leads with a may-know word", async () => {
    // Regression: the cursor was seeded from server order (may-know id 10) while
    // advance walked grouped flow order off a stale closure — deciding once
    // double-hit id 10 and skipped a probably-new word. The cursor must visit
    // every pending word exactly once, in flow order (probably-new first).
    const items = [
      item({ id: 10, term: "diez", likelyKnown: 0.9 }), // may_know
      item({ id: 20, term: "veinte", likelyKnown: 0.1 }), // probably_new
      item({ id: 30, term: "treinta", likelyKnown: 0.1 }), // probably_new
    ];
    mockApi.fetchBatch.mockResolvedValue(batch(items));
    patchEchoes(items);

    render(<Triage sourceId={1} />);

    // Seeded on the first probably-new word, not the leading may-know one.
    await waitFor(() => expect(currentRow()?.textContent).toContain("veinte"));
    fireEvent.keyDown(window, { key: "l" });
    await waitFor(() => expect(currentRow()?.textContent).toContain("treinta"));
    fireEvent.keyDown(window, { key: "l" });
    await waitFor(() => expect(currentRow()?.textContent).toContain("diez"));
    fireEvent.keyDown(window, { key: "l" });

    await screen.findByText("Everything sorted", {}, { timeout: 4000 });
    const decided = mockApi.patchDecision.mock.calls.map((c) => c[0]);
    expect([...decided].sort((a, b) => a - b)).toEqual([10, 20, 30]);
    expect(mockApi.patchDecision).toHaveBeenCalledTimes(3);
  });

  it("keeps the running tally after a decision", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([item({ id: 1, term: "arpón" }), item({ id: 2, term: "barco" })]),
    );
    mockApi.patchDecision.mockResolvedValue(
      item({ id: 1, term: "arpón", decision: "learn" }),
    );

    render(<Triage sourceId={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "Learn" }));

    await waitFor(() =>
      expect(mockApi.patchDecision).toHaveBeenCalledWith(1, "learn"),
    );
    await waitFor(() =>
      expect(screen.getByText(/Know 0 · Learn 1 · Skip 0/)).toBeTruthy(),
    );
  });

  it("offers Undo after a decision and restores the prior state", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([item({ id: 1, term: "arpón" })]),
    );
    mockApi.patchDecision
      .mockResolvedValueOnce(item({ id: 1, term: "arpón", decision: "skip" }))
      .mockResolvedValueOnce(
        item({ id: 1, term: "arpón", decision: "pending" }),
      );

    render(<Triage sourceId={1} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Skip/ }));

    const undo = await screen.findByRole("button", { name: /Undo/ });
    fireEvent.click(undo);
    await waitFor(() =>
      expect(mockApi.patchDecision).toHaveBeenLastCalledWith(1, "pending"),
    );
  });

  it("labels the confirm button with the learn count only", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([
        item({ id: 1, term: "arpón", decision: "learn" }),
        item({ id: 2, term: "barco", decision: "know" }),
        item({ id: 3, term: "scud", decision: "skip" }),
      ]),
    );
    render(<Triage sourceId={1} />);

    // 1 learn → "Keep 1 word", not 2 (know is archived, not kept).
    expect(
      await screen.findByRole("button", { name: /Keep 1 word/ }),
    ).toBeTruthy();
  });
});

describe("Triage confirmation", () => {
  it("summarizes the batch and routes the primary action to /review", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([item({ id: 1, term: "arpón", decision: "learn" })]),
    );
    const summary: ConfirmResponse = {
      materialized: 1,
      known: 0,
      learn: 1,
      skipped: 0,
      dedupeHits: [],
    };
    mockApi.confirmBatch.mockResolvedValue(summary);

    render(<Triage sourceId={1} />);
    fireEvent.click(await screen.findByRole("button", { name: /Keep 1 word/ }));

    await waitFor(() =>
      expect(mockApi.confirmBatch).toHaveBeenCalledWith(1, 1),
    );
    await screen.findByText("1 word added to your review queue");
    fireEvent.click(screen.getByRole("button", { name: "Review now" }));
    expect(assignSpy).toHaveBeenCalledWith("/review");
  });

  it("reports known/skipped counts and offers a secondary path to /library", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([
        item({ id: 1, term: "uno", decision: "know" }),
        item({ id: 2, term: "dos", decision: "skip" }),
      ]),
    );
    mockApi.confirmBatch.mockResolvedValue({
      materialized: 1,
      known: 1,
      learn: 0,
      skipped: 1,
      dedupeHits: [],
    } satisfies ConfirmResponse);

    render(<Triage sourceId={1} />);
    fireEvent.click(await screen.findByRole("button", { name: /Keep/ }));

    await screen.findByText("No new words added this time");
    expect(
      screen.getByText(/1 already known, archived · 1 skipped/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(assignSpy).toHaveBeenCalledWith("/library");
  });

  it("offers a 'next batch' path when more batches remain", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([item({ id: 1, term: "arpón", decision: "learn" })], {
        batchCount: 2,
      }),
    );
    mockApi.confirmBatch.mockResolvedValue({
      materialized: 1,
      known: 0,
      learn: 1,
      skipped: 0,
      dedupeHits: [],
    } satisfies ConfirmResponse);

    render(<Triage sourceId={1} />);
    fireEvent.click(await screen.findByRole("button", { name: /Keep 1 word/ }));

    expect(
      await screen.findByRole("button", { name: "Sort the next batch" }),
    ).toBeTruthy();
  });

  it("surfaces dedupe hits for a keep/merge decision", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([item({ id: 1, term: "arpón", decision: "learn" })]),
    );
    mockApi.confirmBatch.mockResolvedValue({
      materialized: 0,
      known: 0,
      learn: 0,
      skipped: 0,
      dedupeHits: [
        {
          item: item({ id: 1, term: "arpón", decision: "learn" }),
          existingWord: {
            id: 9,
            term: "arpon",
            definitionEn: "harpoon",
            status: "learning",
          },
        },
      ],
    } satisfies ConfirmResponse);
    mockApi.resolveDedupe.mockResolvedValue(
      item({
        id: 1,
        term: "arpón",
        decision: "learn",
        decidedAt: "now",
        wordId: 9,
      }),
    );

    render(<Triage sourceId={1} />);
    fireEvent.click(await screen.findByRole("button", { name: /Keep 1 word/ }));

    expect(await screen.findByText(/Already in your library/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() =>
      expect(mockApi.resolveDedupe).toHaveBeenCalledWith(1, "merge"),
    );
  });

  it("folds resolved dedupe hits into the confirmation summary", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([item({ id: 1, term: "arpón", decision: "learn" })]),
    );
    mockApi.confirmBatch.mockResolvedValue({
      materialized: 0,
      known: 0,
      learn: 0,
      skipped: 0,
      dedupeHits: [
        {
          item: item({ id: 1, term: "arpón", decision: "learn" }),
          existingWord: {
            id: 9,
            term: "arpon",
            definitionEn: "harpoon",
            status: "learning",
          },
        },
      ],
    } satisfies ConfirmResponse);
    mockApi.resolveDedupe.mockResolvedValue(
      item({
        id: 1,
        term: "arpón",
        decision: "learn",
        decidedAt: "now",
        wordId: 10,
      }),
    );

    render(<Triage sourceId={1} />);
    fireEvent.click(await screen.findByRole("button", { name: /Keep 1 word/ }));

    expect(await screen.findByText(/Already in your library/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep both" }));

    // After resolving, the kept word is reflected in the summary headline.
    expect(
      await screen.findByText("1 word added to your review queue"),
    ).toBeTruthy();
  });
});

describe("Triage empty and invalid states", () => {
  it("shows an all-done state with a way onward when nothing was extracted", async () => {
    mockApi.fetchBatch.mockResolvedValue(batch([], { batchCount: 0 }));
    render(<Triage sourceId={1} />);

    await screen.findByText("Nothing to sort here yet.");
    fireEvent.click(screen.getByRole("button", { name: "Go to review" }));
    expect(assignSpy).toHaveBeenCalledWith("/review");
  });

  it("shows an all-sorted state when every candidate was already confirmed", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([
        item({
          id: 1,
          term: "uno",
          decision: "learn",
          decidedAt: "2026-01-02T00:00:00Z",
        }),
      ]),
    );
    render(<Triage sourceId={1} />);

    await screen.findByText(
      "You've already sorted every word from this extraction.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open library" }));
    expect(assignSpy).toHaveBeenCalledWith("/library");
  });

  it("routes onward instead of breaking when the source is invalid", async () => {
    mockApi.fetchBatch.mockRejectedValue(
      new mockApi.ApiError("Source not found", "not_found"),
    );
    render(<Triage sourceId={999} />);

    await screen.findByText(/That extraction isn't available/);
    fireEvent.click(screen.getByRole("button", { name: "Open library" }));
    expect(assignSpy).toHaveBeenCalledWith("/library");
  });

  it("still offers a reload on a transient (non-404) load error", async () => {
    mockApi.fetchBatch.mockRejectedValue(new Error("network down"));
    render(<Triage sourceId={1} />);

    expect(
      await screen.findByRole("button", { name: "Reload" }),
    ).toBeTruthy();
  });
});
