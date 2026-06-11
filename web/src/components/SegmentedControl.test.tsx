// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { SegmentedControl } from "./SegmentedControl";

const options = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "40", label: "40" },
];

describe("SegmentedControl", () => {
  it("exposes radiogroup semantics with the selected segment checked", () => {
    render(
      <SegmentedControl
        label="Length"
        options={options}
        value="20"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Length" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("selects on click", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Length"
        options={options}
        value="10"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "40" }));
    expect(onChange).toHaveBeenCalledWith("40");
  });

  it("arrow keys move the selection and wrap", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Length"
        options={options}
        value="40"
        onChange={onChange}
      />,
    );
    const selected = screen.getByRole("radio", { name: "40" });
    fireEvent.keyDown(selected, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("10");
    fireEvent.keyDown(selected, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("20");
  });

  it("only the selected segment is in the tab order", () => {
    render(
      <SegmentedControl
        label="Length"
        options={options}
        value="20"
        onChange={() => {}}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });
});
