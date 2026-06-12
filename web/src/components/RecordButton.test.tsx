// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../test/setup";
import { RecordButton } from "./RecordButton";

describe("RecordButton", () => {
  it("renders idle state with mic label", () => {
    render(<RecordButton />);
    expect(screen.getByRole("button")).toBeTruthy();
    expect(screen.getByLabelText("Record voice question")).toBeTruthy();
  });

  it("renders recording state with elapsed time", () => {
    render(<RecordButton state="recording" elapsedSeconds={42} />);
    expect(screen.getByText("0:42")).toBeTruthy();
    expect(screen.getByLabelText("Stop recording")).toBeTruthy();
  });

  it("shows countdown in last 15 seconds", () => {
    render(<RecordButton state="recording" elapsedSeconds={108} />);
    // remaining = 120 - 108 = 12s, shows countdown
    expect(screen.getByText("0:12")).toBeTruthy();
  });

  it("is disabled when transcribing", () => {
    render(<RecordButton state="transcribing" />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
