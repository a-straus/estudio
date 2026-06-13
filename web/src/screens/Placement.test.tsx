// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  PlacementNextResponse,
  PlacementCompleteResponse,
  PlacementStatusResponse,
} from "@estudio/shared";
import "../test/setup";

vi.mock("./placementApi", () => ({
  ApiError: class extends Error {},
  fetchPlacementStatus: vi.fn(),
  fetchNextBand: vi.fn(),
  completePlacement: vi.fn(),
}));

import { Placement } from "./Placement";
import * as api from "./placementApi";

const mockApi = api as unknown as {
  fetchPlacementStatus: ReturnType<typeof vi.fn>;
  fetchNextBand: ReturnType<typeof vi.fn>;
  completePlacement: ReturnType<typeof vi.fn>;
};

const PROBE_WORDS = [
  {
    term: "sanguine",
    lemma: "sanguine",
    part_of_speech: "adjective",
    definition_en: "Optimistic.",
    band: "C1" as const,
  },
  {
    term: "ameliorate",
    lemma: "ameliorate",
    part_of_speech: "verb",
    definition_en: "Make better.",
    band: "C1" as const,
  },
];

const NEXT_BAND_RESPONSE: PlacementNextResponse = {
  done: false,
  band: "C1",
  words: PROBE_WORDS,
};

const DONE_RESPONSE: PlacementNextResponse = {
  done: true,
  level: "C1",
};

const COMPLETE_RESPONSE: PlacementCompleteResponse = {
  level: "C1",
  seeded: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.fetchNextBand.mockResolvedValue(NEXT_BAND_RESPONSE);
  mockApi.completePlacement.mockResolvedValue(COMPLETE_RESPONSE);
});

describe("Placement — intro", () => {
  it("renders intro card with Start button", () => {
    render(<Placement />);
    expect(
      screen.getByText(/Mark the English words you already know/i),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /start/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /maybe later/i })).toBeTruthy();
  });
});

describe("Placement — probe card", () => {
  async function startPlacement() {
    render(<Placement />);
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    await waitFor(() => screen.getByText("sanguine"));
  }

  it("renders the first probe word after Start", async () => {
    await startPlacement();
    expect(screen.getByText("sanguine")).toBeTruthy();
    // Progress meta
    expect(screen.getByText(/word 1 · narrowing your level/i)).toBeTruthy();
    // Thumb zone buttons
    expect(
      screen.getByRole("button", { name: /i know this/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /new to me/i })).toBeTruthy();
  });

  it("advances to the next word when 'I know this' is clicked", async () => {
    await startPlacement();
    fireEvent.click(screen.getByRole("button", { name: /i know this/i }));
    await waitFor(() => screen.getByText("ameliorate"));
    expect(screen.getByText(/word 2 · narrowing your level/i)).toBeTruthy();
  });

  it("advances to the next word when 'New to me' is clicked", async () => {
    await startPlacement();
    fireEvent.click(screen.getByRole("button", { name: /new to me/i }));
    await waitFor(() => screen.getByText("ameliorate"));
  });

  it("calls fetchNextBand after last word in band (with done response → result)", async () => {
    // First call: returns 2-word band; second call: done
    mockApi.fetchNextBand
      .mockResolvedValueOnce({ ...NEXT_BAND_RESPONSE, words: [PROBE_WORDS[0]] })
      .mockResolvedValueOnce(DONE_RESPONSE);

    render(<Placement />);
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    await waitFor(() => screen.getByText("sanguine"));

    // Answer the only word — triggers next-band call
    fireEvent.click(screen.getByRole("button", { name: /i know this/i }));

    // Should land on result
    await waitFor(() =>
      screen.getByText(/Your English level/i),
    );
    expect(mockApi.fetchNextBand).toHaveBeenCalledTimes(2);
  });
});

describe("Placement — result", () => {
  it("calls completePlacement and shows seeded count", async () => {
    mockApi.fetchNextBand
      .mockResolvedValueOnce({ ...NEXT_BAND_RESPONSE, words: [PROBE_WORDS[0]] })
      .mockResolvedValueOnce(DONE_RESPONSE);

    render(<Placement />);
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    await waitFor(() => screen.getByText("sanguine"));
    fireEvent.click(screen.getByRole("button", { name: /i know this/i }));

    await waitFor(() => screen.getByText(/Your English level/i));
    await waitFor(() => expect(mockApi.completePlacement).toHaveBeenCalledTimes(1));

    // Verify completePlacement was called with the known word
    const callArgs = mockApi.completePlacement.mock.calls[0][0] as {
      level: string;
      knownWords: { term: string }[];
    };
    expect(callArgs.level).toBe("C1");
    expect(callArgs.knownWords.some((w) => w.term === "sanguine")).toBe(true);
  });
});
