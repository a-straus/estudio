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
  ApiError: class extends Error {},
  fetchBatch: vi.fn(),
  patchDecision: vi.fn(),
  bulkDecide: vi.fn(),
  confirmBatch: vi.fn(),
  resolveDedupe: vi.fn(),
}));

import { Triage } from "./Triage";
import * as api from "./triageApi";

const mockApi = api as unknown as {
  fetchBatch: ReturnType<typeof vi.fn>;
  patchDecision: ReturnType<typeof vi.fn>;
  bulkDecide: ReturnType<typeof vi.fn>;
  confirmBatch: ReturnType<typeof vi.fn>;
  resolveDedupe: ReturnType<typeof vi.fn>;
};

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

function batch(items: ExtractionItemView[]): TriageBatchResponse {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Triage screen", () => {
  it("groups rows by likely-known prediction with per-group bulk actions", async () => {
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

  it("decides the current row, stamps it, and shows the live tally", async () => {
    mockApi.fetchBatch.mockResolvedValue(
      batch([item({ id: 1, term: "arpón" }), item({ id: 2, term: "barco" })]),
    );
    mockApi.patchDecision.mockResolvedValue(
      item({ id: 1, term: "arpón", decision: "learn" }),
    );

    render(<Triage sourceId={1} />);
    const learn = await screen.findByRole("button", { name: "Learn" });
    fireEvent.click(learn);

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

  it("confirms a fully-decided batch and shows the kept-words summary", async () => {
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
    const keep = await screen.findByRole("button", { name: /Keep 1 word/ });
    fireEvent.click(keep);

    await waitFor(() =>
      expect(mockApi.confirmBatch).toHaveBeenCalledWith(1, 1),
    );
    expect(await screen.findByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByText(/0 known archived · 0 skipped/)).toBeTruthy();
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

  it("shows the empty state when there is nothing to sort", async () => {
    mockApi.fetchBatch.mockResolvedValue({
      source: { id: 1, title: "Moby-Dick" },
      batchNo: 1,
      batchCount: 0,
      totalInBatch: 0,
      sortedInBatch: 0,
      items: [],
      tally: { know: 0, learn: 0, skip: 0, pending: 0 },
    });
    render(<Triage sourceId={1} />);
    expect(await screen.findByText(/Nothing to sort/)).toBeTruthy();
  });
});
