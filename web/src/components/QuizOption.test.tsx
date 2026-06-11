// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { QuizOption } from "./QuizOption";

describe("QuizOption", () => {
  it("is clickable in default and selected states", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <QuizOption onClick={onClick}>whale</QuizOption>,
    );
    fireEvent.click(screen.getByRole("button"));
    rerender(
      <QuizOption state="selected" onClick={onClick}>
        whale
      </QuizOption>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("correct state shows the word 'Correct', never color alone", () => {
    render(<QuizOption state="correct">whale</QuizOption>);
    expect(screen.getByText("Correct")).toBeTruthy();
  });

  it("incorrect state shows 'Your answer'", () => {
    render(<QuizOption state="incorrect">shame</QuizOption>);
    expect(screen.getByText("Your answer")).toBeTruthy();
  });

  it("verdict and disabled states are not interactive", () => {
    for (const state of ["correct", "incorrect", "disabled"] as const) {
      const onClick = vi.fn();
      const { unmount } = render(
        <QuizOption state={state} onClick={onClick}>
          opt
        </QuizOption>,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("renders the key ordinal", () => {
    render(<QuizOption ordinal={3}>opt</QuizOption>);
    expect(screen.getByRole("button").textContent).toContain("3");
  });

  it("cloze options use the studied-language class", () => {
    render(<QuizOption cloze>Si tuviera tiempo, leería más.</QuizOption>);
    expect(screen.getByRole("button").className).toContain(
      "quiz-option--cloze",
    );
  });
});
