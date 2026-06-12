// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../test/setup";
import { InsightRow } from "./InsightRow";

describe("InsightRow kind=correction", () => {
  it("renders 'you' and 'tutor' lead-ins with both sentences", () => {
    render(
      <InsightRow
        kind="correction"
        payload={{
          said: "Yo fui ayer en la tienda",
          corrected: "Yo fui ayer a la tienda",
          note: null,
        }}
      />,
    );
    expect(screen.getByText("you")).toBeTruthy();
    expect(screen.getByText("tutor")).toBeTruthy();
    expect(screen.getByText("Yo fui ayer en la tienda")).toBeTruthy();
    expect(screen.getByText("Yo fui ayer a la tienda")).toBeTruthy();
  });

  it("renders an optional note", () => {
    render(
      <InsightRow
        kind="correction"
        payload={{
          said: "fui ayer en",
          corrected: "fui ayer a",
          note: "preposition error",
        }}
      />,
    );
    expect(screen.getByText("preposition error")).toBeTruthy();
  });

  it("omits the note section when null", () => {
    const { container } = render(
      <InsightRow
        kind="correction"
        payload={{ said: "a", corrected: "b", note: null }}
      />,
    );
    expect(container.querySelectorAll(".insight-row__note")).toHaveLength(0);
  });
});

describe("InsightRow kind=struggle", () => {
  it("renders 'struggled' lead-in with the sentence", () => {
    render(
      <InsightRow
        kind="struggle"
        payload={{
          sentence: "Quisiera que hubiera venido.",
          note: null,
        }}
      />,
    );
    expect(screen.getByText("struggled")).toBeTruthy();
    expect(screen.getByText("Quisiera que hubiera venido.")).toBeTruthy();
  });

  it("renders the analyst note when present", () => {
    render(
      <InsightRow
        kind="struggle"
        payload={{
          sentence: "Hubiera ido si pudiera.",
          note: "long pause, tutor supplied hubiera",
        }}
      />,
    );
    expect(screen.getByText("long pause, tutor supplied hubiera")).toBeTruthy();
  });
});
