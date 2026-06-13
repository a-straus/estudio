// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { JobView } from "@estudio/shared";
import "../test/setup";

vi.mock("./ingestApi", () => ({
  ApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  submitText: vi.fn(),
  uploadPdf: vi.fn(),
  uploadMochi: vi.fn(),
  fetchJobs: vi.fn(),
  submitGutenberg: vi.fn(),
  confirmGutenberg: vi.fn(),
}));

import { Ingest } from "./Ingest";
import * as api from "./ingestApi";

const mockApi = api as unknown as {
  submitText: ReturnType<typeof vi.fn>;
  uploadPdf: ReturnType<typeof vi.fn>;
  uploadMochi: ReturnType<typeof vi.fn>;
  fetchJobs: ReturnType<typeof vi.fn>;
  submitGutenberg: ReturnType<typeof vi.fn>;
  confirmGutenberg: ReturnType<typeof vi.fn>;
};

function job(over: Partial<JobView> & { id: number }): JobView {
  return {
    type: "text_ingestion",
    payload: {},
    status: "running",
    progress: null,
    error: null,
    attempts: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  mockApi.submitText.mockReset();
  mockApi.uploadPdf.mockReset();
  mockApi.fetchJobs.mockReset();
  mockApi.fetchJobs.mockResolvedValue([]);
  mockApi.submitGutenberg.mockReset();
  mockApi.confirmGutenberg.mockReset();
  mockApi.uploadMochi.mockReset();
});

describe("Ingest — idle", () => {
  it("shows the method tabs and the PDF drop zone by default", () => {
    render(<Ingest />);
    expect(screen.getByRole("heading", { name: "Ingest" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Upload PDF" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Drop a PDF scan here, or browse" }),
    ).toBeDefined();
  });

  it("renders the Gutenberg URL/ID input (no longer 'coming soon')", () => {
    render(<Ingest />);
    fireEvent.click(screen.getByRole("radio", { name: "Gutenberg" }));
    const field = screen.getByLabelText(
      "Gutenberg URL or ID",
    ) as HTMLInputElement;
    expect(field.disabled).toBe(false);
    expect(
      screen.getByRole("button", { name: "Fetch & estimate" }),
    ).toBeDefined();
  });

  it("renders Import as a Mochi file picker and shows the import summary", async () => {
    mockApi.uploadMochi.mockResolvedValue({
      imported: 312,
      duplicates: 19,
      total: 331,
      deck: "en",
    });
    render(<Ingest />);
    fireEvent.click(screen.getByRole("radio", { name: "Import" }));
    expect(
      screen.getByRole("button", { name: "Choose a Mochi export (.mochi)" }),
    ).toBeDefined();

    const input = screen.getByLabelText(
      "Choose a Mochi export",
    ) as HTMLInputElement;
    const file = new File(["zip"], "Vocab.mochi");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(
        screen.getByText("331 cards · 312 added · 19 already in your deck"),
      ).toBeDefined(),
    );
    expect(mockApi.uploadMochi).toHaveBeenCalledWith(file);
  });
});

describe("Ingest — Gutenberg", () => {
  it("fetches an estimate, then confirms to start the job", async () => {
    mockApi.submitGutenberg.mockResolvedValue({
      sourceId: 42,
      title: "The King James Bible",
      wordCount: 12000,
      batches: 60,
      estimateUsd: 6.5,
    });
    mockApi.confirmGutenberg.mockResolvedValue({
      sourceId: 42,
      jobId: 9,
      pageCount: 60,
    });
    render(<Ingest pollIntervalMs={10_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Gutenberg" }));

    fireEvent.change(screen.getByLabelText("Gutenberg URL or ID"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch & estimate" }));

    // Estimate region: title · candidate count · cost, with the >$5 spend
    // warning made explicit before the owner proceeds.
    await screen.findByText(/The King James Bible/);
    expect(screen.getByText(/12,000 unique candidate words/)).toBeDefined();
    // $6.50 appears in both the estimate line and the >$5 spend warning.
    expect(screen.getAllByText(/\$6\.50/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/won't start until you confirm/)).toBeDefined();
    expect(mockApi.submitGutenberg).toHaveBeenCalledWith({ ref: "10" });

    fireEvent.click(screen.getByRole("button", { name: "Extract words" }));

    await waitFor(() =>
      expect(mockApi.confirmGutenberg).toHaveBeenCalledWith(42),
    );
  });

  it("surfaces a fetch error and does not confirm", async () => {
    // A non-ApiError rejection falls back to the generic message.
    mockApi.submitGutenberg.mockRejectedValue(new Error("network down"));
    render(<Ingest pollIntervalMs={10_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Gutenberg" }));
    fireEvent.change(screen.getByLabelText("Gutenberg URL or ID"), {
      target: { value: "nonsense" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch & estimate" }));

    await screen.findByText(/Couldn't fetch that book\./);
    expect(mockApi.confirmGutenberg).not.toHaveBeenCalled();
  });
});

describe("Ingest — paste", () => {
  it("disables Extract until text is entered, then submits the paste", async () => {
    mockApi.submitText.mockResolvedValue({
      sourceId: 7,
      jobId: 3,
      pageCount: 2,
    });
    render(<Ingest pollIntervalMs={10_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Paste text" }));

    const extract = screen.getByRole("button", { name: "Extract words" });
    expect((extract as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Paste text"), {
      target: { value: "Una frase con estrépito." },
    });
    expect((extract as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(extract);
    await waitFor(() =>
      expect(mockApi.submitText).toHaveBeenCalledWith({
        text: "Una frase con estrépito.",
      }),
    );
    // The panel gives way to the job block (queued).
    await waitFor(() => expect(screen.getByText("Queued…")).toBeDefined());
  });

  it("surfaces a submit error in the UI without losing the text", async () => {
    mockApi.submitText.mockRejectedValue(
      new api.ApiError("text is required", "missing_text"),
    );
    render(<Ingest />);
    fireEvent.click(screen.getByRole("radio", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Paste text"), {
      target: { value: "hola" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract words" }));

    await waitFor(() =>
      expect(screen.getByText("text is required")).toBeDefined(),
    );
    expect(
      (screen.getByLabelText("Paste text") as HTMLTextAreaElement).value,
    ).toBe("hola");
  });
});

describe("Ingest — PDF upload", () => {
  it("uploads the chosen file and shows progress", async () => {
    mockApi.uploadPdf.mockResolvedValue({
      source: { id: 9 },
      jobId: 4,
      pageCount: 3,
    });
    render(<Ingest pollIntervalMs={10_000} />);
    const input = screen.getByLabelText(
      "Choose a PDF scan",
    ) as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "scan.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockApi.uploadPdf).toHaveBeenCalledWith(file));
    await waitFor(() => expect(screen.getByText("Queued…")).toBeDefined());
  });
});

describe("Ingest — job progress", () => {
  it("polls and shows the running stage line", async () => {
    mockApi.submitText.mockResolvedValue({
      sourceId: 7,
      jobId: 3,
      pageCount: 2,
    });
    mockApi.fetchJobs.mockResolvedValue([
      job({ id: 3, status: "running", progress: { pages: { 1: "done" } } }),
    ]);
    render(<Ingest pollIntervalMs={10_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Paste text"), {
      target: { value: "texto largo aquí" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract words" }));

    await waitFor(() =>
      expect(screen.getByText("Reading chunk 2 of 2")).toBeDefined(),
    );
  });

  it("takes the 'N of M' total from the progress JSON, not the submit count", async () => {
    // pageCount 0 on upload: the denominator must come from the streamed total.
    mockApi.uploadPdf.mockResolvedValue({
      source: { id: 9 },
      jobId: 4,
      pageCount: 0,
    });
    mockApi.fetchJobs.mockResolvedValue([
      job({
        id: 4,
        type: "pdf_ingestion",
        status: "running",
        progress: { pages: { 1: "done", 2: "done" }, total: 5 },
      }),
    ]);
    render(<Ingest pollIntervalMs={10_000} />);
    const input = screen.getByLabelText(
      "Choose a PDF scan",
    ) as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "scan.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText("Reading page 3 of 5")).toBeDefined(),
    );
  });

  it("on PDF completion reads 'N of M pages' from the progress total", async () => {
    mockApi.uploadPdf.mockResolvedValue({
      source: { id: 9 },
      jobId: 4,
      pageCount: 0,
    });
    mockApi.fetchJobs.mockResolvedValue([
      job({
        id: 4,
        type: "pdf_ingestion",
        status: "done",
        progress: { pages: { 1: "done", 2: "done", 3: "done" }, total: 3 },
      }),
    ]);
    render(<Ingest pollIntervalMs={10_000} />);
    const input = screen.getByLabelText(
      "Choose a PDF scan",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" }),
        ],
      },
    });

    await waitFor(() =>
      expect(screen.getByText("Read 3 of 3 pages.")).toBeDefined(),
    );
  });

  it("on completion links to triage for the new source", async () => {
    mockApi.submitText.mockResolvedValue({
      sourceId: 7,
      jobId: 3,
      pageCount: 2,
    });
    mockApi.fetchJobs.mockResolvedValue([
      job({
        id: 3,
        status: "done",
        progress: { pages: { 1: "done", 2: "done" } },
      }),
    ]);
    render(<Ingest pollIntervalMs={10_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Paste text"), {
      target: { value: "texto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract words" }));

    const link = await waitFor(() =>
      screen.getByRole("link", { name: "Continue to triage" }),
    );
    expect(link.getAttribute("href")).toBe("/triage?source=7");
  });

  it("on failure shows the partial-failure message and still offers triage", async () => {
    mockApi.submitText.mockResolvedValue({
      sourceId: 7,
      jobId: 3,
      pageCount: 2,
    });
    mockApi.fetchJobs.mockResolvedValue([
      job({
        id: 3,
        status: "failed",
        progress: { pages: { 1: "done", 2: "failed" } },
      }),
    ]);
    render(<Ingest pollIntervalMs={10_000} />);
    fireEvent.click(screen.getByRole("radio", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Paste text"), {
      target: { value: "texto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract words" }));

    const block = await waitFor(() =>
      screen.getByText(/Couldn't read 1 chunks/),
    );
    expect(
      within(block.closest(".ingest__job")!).getByRole("link"),
    ).toBeDefined();
  });
});
