// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { JobStatus } from "./JobStatus";

describe("JobStatus", () => {
  it("running shows stage, progress, cost, and Cancel / Run in background", () => {
    const onCancel = vi.fn();
    const onBackground = vi.fn();
    render(
      <JobStatus
        state="running"
        stage="Reading chapter 41 of 135"
        progress={0.31}
        cost="$0.31 so far"
        onCancel={onCancel}
        onBackground={onBackground}
      />,
    );
    expect(screen.getByText("Reading chapter 41 of 135")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "31",
    );
    expect(screen.getByText("$0.31 so far")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Run in background" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onBackground).toHaveBeenCalledOnce();
  });

  it("done appends the duration to the stage line", () => {
    render(
      <JobStatus state="done" stage="412 words extracted" duration="12 min" />,
    );
    expect(screen.getByText("412 words extracted · 12 min")).toBeTruthy();
  });

  it("failed offers Retry and no progress track", () => {
    const onRetry = vi.fn();
    render(
      <JobStatus
        state="failed"
        stage="Couldn't read 3 pages (smudged scan). Retry, or re-scan pages 12–14."
        onRetry={onRetry}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("queued renders no actions", () => {
    render(
      <JobStatus
        state="queued"
        stage="Waiting"
        onCancel={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
