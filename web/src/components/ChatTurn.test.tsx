// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../test/setup";
import { ChatTurn } from "./ChatTurn";

describe("ChatTurn", () => {
  it("renders user turn with 'you' label", () => {
    render(<ChatTurn role="user" content="Why is it reflexive?" />);
    expect(screen.getByText("you")).toBeTruthy();
    expect(screen.getByText("Why is it reflexive?")).toBeTruthy();
  });

  it("renders assistant turn without label", () => {
    render(<ChatTurn role="assistant" content="Because avergonzarse…" />);
    expect(screen.queryByText("you")).toBeNull();
    expect(screen.getByText("Because avergonzarse…")).toBeTruthy();
  });

  it("renders pending-transcription state", () => {
    render(
      <ChatTurn role="user" content="" state="pending-transcription" />,
    );
    expect(screen.getByText("Transcribing your question…")).toBeTruthy();
  });

  it("renders failed state with Retry button", () => {
    const onRetry = vi.fn();
    render(
      <ChatTurn
        role="assistant"
        content="fail"
        state="failed"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/The answer didn't arrive/)).toBeTruthy();
    screen.getByText("Retry").click();
    expect(onRetry).toHaveBeenCalled();
  });
});
