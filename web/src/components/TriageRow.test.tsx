// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { TriageRow } from "./TriageRow";

const word = {
  headword: "arpón",
  language: "ES",
  partOfSpeech: "sustantivo",
  level: "B2",
  glossEn: "harpoon",
};

describe("TriageRow", () => {
  it("current row offers Know / Learn / Skip", () => {
    const onKnow = vi.fn();
    const onLearn = vi.fn();
    const onSkip = vi.fn();
    render(
      <TriageRow
        word={word}
        state="current"
        onKnow={onKnow}
        onLearn={onLearn}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Learn/ }));
    fireEvent.click(screen.getByRole("button", { name: /Know/ }));
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(onLearn).toHaveBeenCalledOnce();
    expect(onKnow).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("upcoming row with a generating definition shows 'defining…'", () => {
    render(<TriageRow word={word} state="upcoming" defining />);
    expect(screen.getByText("defining…")).toBeTruthy();
    expect(screen.queryByText("harpoon")).toBeNull();
  });

  it("upcoming row shows the compact gloss once defined", () => {
    render(<TriageRow word={word} state="upcoming" />);
    expect(screen.getByText("harpoon")).toBeTruthy();
  });

  it("decided row stamps the decision", () => {
    const { container } = render(
      <TriageRow word={word} state="decided" decision="learn" />,
    );
    const stamp = container.querySelector(".triage-row__stamp");
    expect(stamp?.textContent).toBe("Learn");
    expect(stamp?.className).toContain("triage-row__stamp--learn");
  });

  it("skip decision marks the row for the strikethrough headword", () => {
    const { container } = render(
      <TriageRow word={word} state="decided" decision="skip" />,
    );
    expect(
      container.querySelector(".triage-row--skip .word-entry__headword"),
    ).toBeTruthy();
  });

  it("error row states the failure and retries inline", () => {
    const onRetry = vi.fn();
    render(<TriageRow word={word} state="error" onRetry={onRetry} />);
    expect(
      screen.getByText(/definition failed — write one in Library/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
