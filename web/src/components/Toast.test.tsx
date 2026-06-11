// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { Toast } from "./Toast";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("info auto-dismisses after 4s", () => {
    const onDismiss = vi.fn();
    render(<Toast onDismiss={onDismiss}>vergüenza · due now</Toast>);
    vi.advanceTimersByTime(3999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("error persists and dismisses only on request", () => {
    const onDismiss = vi.fn();
    render(
      <Toast variant="error" onDismiss={onDismiss}>
        Couldn't generate the explanation. Try again.
      </Toast>,
    );
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders the action as a button and fires it", () => {
    const onUndo = vi.fn();
    render(
      <Toast onDismiss={() => {}} action={{ label: "Undo", onClick: onUndo }}>
        Keep 24 words
      </Toast>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
