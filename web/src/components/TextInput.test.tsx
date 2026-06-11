// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("associates the label and reports changes", () => {
    const onChange = vi.fn();
    render(<TextInput label="Headword" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Headword");
    fireEvent.change(input, { target: { value: "ballena" } });
    expect(onChange).toHaveBeenCalledWith("ballena");
  });

  it("shows the error message and sets aria-invalid", () => {
    render(
      <TextInput
        label="Definition"
        value=""
        onChange={() => {}}
        error="Couldn't auto-fill. Write the definition, or retry."
      />,
    );
    const input = screen.getByLabelText("Definition");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = screen.getByText(
      "Couldn't auto-fill. Write the definition, or retry.",
    );
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("error replaces the help line", () => {
    render(
      <TextInput
        label="Definition"
        value=""
        onChange={() => {}}
        help="Plain words."
        error="Too long."
      />,
    );
    expect(screen.queryByText("Plain words.")).toBeNull();
    expect(screen.getByText("Too long.")).toBeTruthy();
  });

  it("multiline renders a textarea; study content gets the serif class", () => {
    render(
      <TextInput
        label="Example"
        value=""
        onChange={() => {}}
        multiline
        study
      />,
    );
    const field = screen.getByLabelText("Example");
    expect(field.tagName).toBe("TEXTAREA");
    expect(field.className).toContain("text-input__field--study");
  });
});
