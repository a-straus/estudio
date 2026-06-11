// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { ClozeStem, ReviewCard } from "./ReviewCard";
import { WordEntry } from "./WordEntry";

describe("ReviewCard", () => {
  it("renders the prompt line and the front content", () => {
    render(
      <ReviewCard prompt="Choose the definition.">
        <WordEntry size="hero" headword="vergüenza" />
      </ReviewCard>,
    );
    expect(screen.getByText("Choose the definition.")).toBeTruthy();
    expect(screen.getByText("vergüenza")).toBeTruthy();
  });

  it("flip mode flips on tap and on Space", () => {
    const onFlip = vi.fn();
    render(
      <ReviewCard mode="flip" prompt="" onFlip={onFlip} back={<p>back</p>}>
        <p>front</p>
      </ReviewCard>,
    );
    const card = screen.getByRole("button");
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: " " });
    expect(onFlip).toHaveBeenCalledTimes(2);
  });

  it("hides the inactive face from assistive tech", () => {
    const { container, rerender } = render(
      <ReviewCard
        mode="flip"
        prompt=""
        onFlip={() => {}}
        flipped={false}
        back={<p>back</p>}
      >
        <p>front</p>
      </ReviewCard>,
    );
    let faces = container.querySelectorAll(".review-card__face");
    expect(faces[0].getAttribute("aria-hidden")).toBe("false");
    expect(faces[1].getAttribute("aria-hidden")).toBe("true");
    rerender(
      <ReviewCard
        mode="flip"
        prompt=""
        onFlip={() => {}}
        flipped
        back={<p>back</p>}
      >
        <p>front</p>
      </ReviewCard>,
    );
    faces = container.querySelectorAll(".review-card__face");
    expect(faces[0].getAttribute("aria-hidden")).toBe("true");
    expect(faces[1].getAttribute("aria-hidden")).toBe("false");
  });

  it("choice mode is not a button", () => {
    render(
      <ReviewCard prompt="Choose the word.">
        <p>stem</p>
      </ReviewCard>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ClozeStem", () => {
  it("renders the blank as 5 underscores between the stem parts", () => {
    const { container } = render(
      <ClozeStem before="Si" after="tiempo, leería más." />,
    );
    const blank = container.querySelector(".cloze-stem__blank");
    expect(blank?.textContent).toBe("_____");
    expect(container.textContent).toBe("Si _____ tiempo, leería más.");
  });
});
