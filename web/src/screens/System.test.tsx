// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  GetSettingsResponse,
  SystemErrorsResponse,
  SystemJobsResponse,
  SystemSpendResponse,
  SystemStatusResponse,
} from "@estudio/shared";
import "../test/setup";

vi.mock("./systemApi", () => ({
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  fetchErrors: vi.fn(),
  fetchJobs: vi.fn(),
  fetchSpend: vi.fn(),
  fetchStatus: vi.fn(),
  triggerBackup: vi.fn(),
  getSettings: vi.fn(),
  putSettings: vi.fn(),
}));

import { System } from "./System";
import * as api from "./systemApi";

const mockApi = api as unknown as {
  fetchErrors: ReturnType<typeof vi.fn>;
  fetchJobs: ReturnType<typeof vi.fn>;
  fetchSpend: ReturnType<typeof vi.fn>;
  fetchStatus: ReturnType<typeof vi.fn>;
  triggerBackup: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  putSettings: ReturnType<typeof vi.fn>;
};

const SETTINGS: GetSettingsResponse = {
  settings: { definitionDisplay: "both", newCardsPerDay: 20 },
};

const SPEND: SystemSpendResponse = {
  totalCostUsd: 4.12,
  totalTokensIn: 800,
  totalTokensOut: 350,
  callCount: 3,
  byTask: [
    {
      task: "word_definition",
      costUsd: 1.9,
      tokensIn: 300,
      tokensOut: 150,
      callCount: 2,
    },
    {
      task: "pdf_extraction",
      costUsd: 2.22,
      tokensIn: 500,
      tokensOut: 200,
      callCount: 1,
    },
  ],
};

const JOBS: SystemJobsResponse = {
  jobs: [
    {
      id: 2,
      type: "text_ingestion",
      payload: {},
      status: "failed",
      progress: null,
      error: "boom",
      attempts: 3,
      createdAt: "2026-06-10T12:00:00Z",
      updatedAt: "2026-06-10T12:00:00Z",
    },
  ],
};

const ERRORS: SystemErrorsResponse = {
  errors: [
    {
      ts: "2026-06-08T14:02:00Z",
      scope: "job",
      message: "job failed permanently",
      detail: null,
    },
  ],
};

const STATUS: SystemStatusResponse = {
  db: { path: "/data/app.db", fileSizeBytes: 2_100_000, walMode: true },
  backup: {
    latestFilename: "app-2026-06-10T23-40-00Z.db",
    latestTs: "2026-06-10T23:40:00Z",
    count: 3,
  },
};

beforeEach(() => {
  mockApi.fetchSpend.mockReset().mockResolvedValue(SPEND);
  mockApi.fetchJobs.mockReset().mockResolvedValue(JOBS);
  mockApi.fetchErrors.mockReset().mockResolvedValue(ERRORS);
  mockApi.fetchStatus.mockReset().mockResolvedValue(STATUS);
  mockApi.triggerBackup.mockReset();
  mockApi.getSettings.mockReset().mockResolvedValue(SETTINGS);
  mockApi.putSettings.mockReset().mockResolvedValue(SETTINGS);
});

describe("System screen", () => {
  it("renders spend, jobs, errors, and backup sections", async () => {
    render(<System />);

    // Spend total + a per-task row.
    expect(
      await screen.findByText(/LLM spend · \$4\.12 · 3 calls/),
    ).toBeTruthy();
    // Internal task keys read back as the spec's plain feature words.
    expect(screen.getByText("Definitions")).toBeTruthy();

    // Jobs section shows the failed ingestion, type humanized from its key.
    expect(screen.getByText("Text ingestion")).toBeTruthy();

    // Errors section.
    expect(screen.getByText("job failed permanently")).toBeTruthy();

    // Backup status + button.
    expect(screen.getByText(/3 kept/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Export backup now" }),
    ).toBeTruthy();
  });

  it("triggers a manual backup and reloads status", async () => {
    mockApi.triggerBackup.mockResolvedValue({
      filename: "app-2026-06-11T13-50-00Z.db",
    });

    render(<System />);
    const btn = await screen.findByRole("button", {
      name: "Export backup now",
    });
    fireEvent.click(btn);

    await waitFor(() => expect(mockApi.triggerBackup).toHaveBeenCalledTimes(1));
    // Status is re-fetched after the backup (initial load + reload).
    await waitFor(() =>
      expect(mockApi.fetchStatus.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("renders the Preferences controls with current values loaded", async () => {
    render(<System />);

    // Both segmented controls render.
    expect(
      await screen.findByRole("radiogroup", { name: "Definitions on reveal" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radiogroup", { name: "New cards per day" }),
    ).toBeTruthy();

    // Loaded values are reflected as the checked segments.
    await waitFor(() =>
      expect(
        screen
          .getByRole("radio", { name: "Both" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(
      screen.getByRole("radio", { name: "20" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("PUTs the new value when a preference changes", async () => {
    mockApi.putSettings.mockResolvedValue({
      settings: { definitionDisplay: "es", newCardsPerDay: 20 },
    });

    render(<System />);
    const spanish = await screen.findByRole("radio", { name: "Spanish" });
    fireEvent.click(spanish);

    await waitFor(() =>
      expect(mockApi.putSettings).toHaveBeenCalledWith({
        definitionDisplay: "es",
      }),
    );
    // Optimistically reflected.
    await waitFor(() =>
      expect(spanish.getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("surfaces a per-section failure plainly without blanking the page", async () => {
    mockApi.fetchJobs.mockRejectedValue(new Error("disk error"));

    render(<System />);

    // The jobs section states its failure…
    expect(await screen.findByText(/Job log unreadable/)).toBeTruthy();
    // …while the spend section still renders.
    expect(screen.getByText(/LLM spend · \$4\.12/)).toBeTruthy();
  });
});
