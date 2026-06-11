// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../test/setup";
import { WordEntry } from "./WordEntry";

const word = {
  headword: "tuviera",
  lemma: "tener",
  language: "ES",
  partOfSpeech: "verbo",
  level: "C1",
  glossEs: "forma del subjuntivo imperfecto de tener",
  glossEn: "had (imperfect subjunctive)",
  example: "Si tuviera tiempo, leería más.",
};

describe("WordEntry", () => {
  it("renders encountered form with lemma after an em dash when they differ", () => {
    const { container } = render(<WordEntry size="full" {...word} />);
    const headword = container.querySelector(".word-entry__headword");
    expect(headword?.textContent).toBe("tuviera — tener");
  });

  it("omits the lemma when it equals the headword", () => {
    const { container } = render(
      <WordEntry size="full" {...word} headword="tener" lemma="tener" />,
    );
    const headword = container.querySelector(".word-entry__headword");
    expect(headword?.textContent).toBe("tener");
  });

  it("builds the tagline from the known parts, separators with them", () => {
    render(<WordEntry size="full" {...word} partOfSpeech={undefined} />);
    expect(screen.getByText("ES · C1")).toBeTruthy();
  });

  it("renders no tagline when all parts are unknown", () => {
    const { container } = render(
      <WordEntry
        size="full"
        headword="ballena"
        language={undefined}
        partOfSpeech={undefined}
        level={undefined}
      />,
    );
    expect(container.querySelector(".word-entry__tagline")).toBeNull();
  });

  it("hero hides gloss and example (it's the question)", () => {
    const { container } = render(<WordEntry size="hero" {...word} />);
    expect(container.querySelector(".word-entry__gloss")).toBeNull();
    expect(container.querySelector(".word-entry__example")).toBeNull();
  });

  it("full shows both definition lines by default, Spanish first", () => {
    const { container } = render(<WordEntry size="full" {...word} />);
    const glosses = container.querySelectorAll(".word-entry__gloss");
    expect(glosses).toHaveLength(2);
    expect(glosses[0].classList.contains("word-entry__gloss--es")).toBe(true);
    expect(glosses[0].textContent).toBe(word.glossEs);
    expect(glosses[1].textContent).toBe(word.glossEn);
  });

  it("full respects the reveal preference", () => {
    const { container } = render(
      <WordEntry size="full" {...word} reveal="es" />,
    );
    const glosses = container.querySelectorAll(".word-entry__gloss");
    expect(glosses).toHaveLength(1);
    expect(glosses[0].textContent).toBe(word.glossEs);
  });

  it("falls back to the other line when the preferred one is missing", () => {
    const { container } = render(
      <WordEntry size="full" {...word} glossEs={undefined} reveal="es" />,
    );
    const glosses = container.querySelectorAll(".word-entry__gloss");
    expect(glosses).toHaveLength(1);
    expect(glosses[0].textContent).toBe(word.glossEn);
  });

  it("compact shows encountered form only, English gloss only, level only", () => {
    const { container } = render(<WordEntry size="compact" {...word} />);
    const headword = container.querySelector(".word-entry__headword");
    expect(headword?.textContent).toBe("tuviera");
    const glosses = container.querySelectorAll(".word-entry__gloss");
    expect(glosses).toHaveLength(1);
    expect(glosses[0].textContent).toBe(word.glossEn);
    expect(container.querySelector(".word-entry__tagline")?.textContent).toBe(
      "C1",
    );
    expect(container.querySelector(".word-entry__example")).toBeNull();
  });
});
