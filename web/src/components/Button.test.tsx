// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { Button } from "./Button";

describe("Button", () => {
  it("renders the variant class and fires onClick", () => {
    const onClick = vi.fn();
    render(
      <Button variant="secondary" onClick={onClick}>
        Know
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Know" });
    expect(button.className).toContain("btn--secondary");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("busy swaps to the busy label and disables", () => {
    const onClick = vi.fn();
    render(
      <Button busy busyLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("busy without busyLabel appends an ellipsis and disables", () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save…" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it never submits forms", () => {
    render(<Button>Next</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });
});
