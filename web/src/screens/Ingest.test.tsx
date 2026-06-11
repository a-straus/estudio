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
  fetchJobs: vi.fn(),
}));

import { Ingest } from "./Ingest";
import * as api from "./ingestApi";

const mockApi = api as unknown as {
  submitText: ReturnType<typeof vi.fn>;
  uploadPdf: ReturnType<typeof vi.fn>;
  fetchJobs: ReturnType<typeof vi.fn>;
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

  it("renders Gutenberg and Import as disabled 'coming soon' panels", () => {
    render(<Ingest />);
    fireEvent.click(screen.getByRole("radio", { name: "Gutenberg" }));
    expect(screen.getByText("Coming soon.")).toBeDefined();
    const field = screen.getByLabelText(
      "Gutenberg URL or ID",
    ) as HTMLInputElement;
    expect(field.disabled).toBe(true);
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
