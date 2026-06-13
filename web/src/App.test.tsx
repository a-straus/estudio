// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "./test/setup";

vi.mock("./screens/overviewApi", () => ({
  fetchOverview: vi.fn().mockResolvedValue({
    featured: null,
    review: { due: 0, newToday: 0 },
    library: { total: 0, mature: 0 },
    grammar: { topics: 0, belowFifty: 0, seeded: false },
    suggestions: { pool: 0 },
    recentWords: [],
    latestJob: null,
    lastBackupAt: null,
  }),
}));

vi.mock("./screens/ingestApi", () => ({
  ApiError: class extends Error {},
  fetchJobs: vi.fn().mockResolvedValue([]),
  submitText: vi.fn(),
  uploadPdf: vi.fn(),
  submitAudio: vi.fn(),
}));

import { App } from "./App";

const ORIGINAL_LOCATION = window.location;

function setPathname(pathname: string) {
  Object.defineProperty(window, "location", {
    value: { ...ORIGINAL_LOCATION, href: `http://localhost${pathname}`, pathname, search: "" },
    writable: true,
    configurable: true,
  });
}

function mockMatchMedia(phone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: phone,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  setPathname("/ingest");
});

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: ORIGINAL_LOCATION,
    writable: true,
    configurable: true,
  });
});

describe("App /ingest route — phone", () => {
  it("shows the desktop-only notice and not the workbench on phone", async () => {
    mockMatchMedia(true);
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText(/Ingest is desktop-only/),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Upload PDF")).toBeNull();
  });
});

describe("App /ingest route — desktop", () => {
  it("renders the Ingest workbench and not the notice on desktop", async () => {
    mockMatchMedia(false);
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Upload PDF")).toBeTruthy(),
    );
    expect(screen.queryByText(/Ingest is desktop-only/)).toBeNull();
  });
});
