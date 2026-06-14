// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { TappableText } from "./TappableText";
import { QuickAddProvider } from "./QuickAddContext";
import type { ReactNode } from "react";

function withProvider(openQuickAdd: ReturnType<typeof vi.fn>, node: ReactNode) {
  return render(
    <QuickAddProvider openQuickAdd={openQuickAdd}>{node}</QuickAddProvider>,
  );
}

describe("TappableText", () => {
  it("renders all words as interactive buttons", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="hello world" language="en" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe("hello");
    expect(buttons[1].textContent).toBe("world");
  });

  it("preserves spacing between tokens (space is a plain text node)", () => {
    const spy = vi.fn();
    const { container } = withProvider(
      spy,
      <span>
        <TappableText text="one two" language="es" />
      </span>,
    );
    expect(container.querySelector("span")?.textContent).toBe("one two");
  });

  it("preserves leading/trailing punctuation in display but strips when calling openQuickAdd", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="firmament," language="en" />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toBe("firmament,");
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledWith("firmament", "en");
  });

  it("strips parenthetical punctuation: (word) → word", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="(hola)" language="es" />);
    fireEvent.click(screen.getByRole("button"));
    expect(spy).toHaveBeenCalledWith("hola", "es");
  });

  it("keeps Spanish accent letters intact", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="también," language="es" />);
    fireEvent.click(screen.getByRole("button"));
    expect(spy).toHaveBeenCalledWith("también", "es");
  });

  it("clicking a word calls openQuickAdd with the cleaned word and given language", () => {
    const spy = vi.fn();
    withProvider(
      spy,
      <TappableText text="buenas noches" language="es" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "buenas" }));
    expect(spy).toHaveBeenCalledWith("buenas", "es");
  });

  it("Enter key on a focused word activates openQuickAdd", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="tarde" language="es" />);
    const btn = screen.getByRole("button");
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(spy).toHaveBeenCalledWith("tarde", "es");
  });

  it("Space key on a focused word activates openQuickAdd", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="noche" language="es" />);
    const btn = screen.getByRole("button");
    fireEvent.keyDown(btn, { key: " " });
    expect(spy).toHaveBeenCalledWith("noche", "es");
  });

  it("pure punctuation tokens are not buttons", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="— hello" language="en" />);
    // "—" is pure punctuation (no letter), "hello" is a word
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("hello");
  });

  it("renders without a provider using the no-op default (no crash)", () => {
    expect(() =>
      render(<TappableText text="safe" language="en" />),
    ).not.toThrow();
  });

  it("passes the correct language for Spanish text", () => {
    const spy = vi.fn();
    withProvider(spy, <TappableText text="café" language="es" />);
    fireEvent.click(screen.getByRole("button"));
    expect(spy).toHaveBeenCalledWith("café", "es");
  });
});
