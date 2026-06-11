// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the message and its one action", () => {
    const onClick = vi.fn();
    render(
      <EmptyState message="No words yet. Ingest something, or add one by hand.">
        <Button variant="secondary" onClick={onClick}>
          Add word
        </Button>
      </EmptyState>,
    );
    expect(
      screen.getByText("No words yet. Ingest something, or add one by hand."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
