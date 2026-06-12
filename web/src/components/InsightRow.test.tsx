// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { InsightRow } from "./InsightRow";

describe("InsightRow kind=correction", () => {
  it("renders 'you' and 'tutor' lead-ins with both sentences", () => {
    const { container } = render(
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
    // Word-diff splits text across spans; check via textContent (recursive).
    expect(
      container.querySelector(".insight-row__text--said")?.textContent,
    ).toBe("Yo fui ayer en la tienda");
    expect(
      container.querySelector(".insight-row__text--corrected")?.textContent,
    ).toBe("Yo fui ayer a la tienda");
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

  it("underlines only the changed word span in said and corrected", () => {
    const { container } = render(
      <InsightRow
        kind="correction"
        payload={{
          said: "fui en la tienda",
          corrected: "fui a la tienda",
          note: null,
        }}
      />,
    );
    const changed = container.querySelectorAll(".insight-row__changed");
    expect(changed).toHaveLength(2);
    expect(changed[0].textContent).toBe("en");
    expect(changed[1].textContent).toBe("a");
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

describe("InsightRow — Ask about this button", () => {
  const ORIGINAL_LOCATION = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: ORIGINAL_LOCATION,
      writable: true,
      configurable: true,
    });
  });

  it("correction: clicking Ask about this navigates to Ask seeded with the corrected phrase", () => {
    render(
      <InsightRow
        kind="correction"
        payload={{
          said: "fui en la tienda",
          corrected: "fui a la tienda",
          note: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask about this" }));
    expect(window.location.href).toBe(
      `/ask?new=1&kind=other&label=${encodeURIComponent("fui a la tienda")}`,
    );
  });

  it("struggle: clicking Ask about this navigates to Ask seeded with the sentence", () => {
    render(
      <InsightRow
        kind="struggle"
        payload={{ sentence: "Quisiera que hubiera venido.", note: null }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask about this" }));
    expect(window.location.href).toBe(
      `/ask?new=1&kind=other&label=${encodeURIComponent("Quisiera que hubiera venido.")}`,
    );
  });
});
