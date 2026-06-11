// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { WordDetail } from "./WordDetail";

const word = {
  headword: "vergüenza",
  language: "ES",
  partOfSpeech: "sustantivo",
  level: "B1",
  glossEs: "sentimiento de pérdida de dignidad",
  glossEn: "shame, embarrassment",
  example: "Le dio vergüenza hablar en público.",
};

describe("WordDetail", () => {
  it("editing turns gloss and example into inputs and saves the draft", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WordDetail word={word} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const glossEn = screen.getByLabelText("Definition (English)");
    fireEvent.change(glossEn, { target: { value: "shame" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(onSave).toHaveBeenCalledWith({
      glossEs: word.glossEs,
      glossEn: "shame",
      example: word.example,
    });
    // back to viewing
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("cancel discards the draft and returns to viewing", () => {
    const onSave = vi.fn();
    render(<WordDetail word={word} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("delete goes through the inline confirm", () => {
    const onDelete = vi.fn();
    render(<WordDetail word={word} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete word…" }));
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Its card and schedule go with it.");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("Keep dismisses the confirm without deleting", () => {
    const onDelete = vi.fn();
    render(<WordDetail word={word} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete word…" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("'I forgot this' calls onForgot", () => {
    const onForgot = vi.fn();
    render(<WordDetail word={word} onForgot={onForgot} />);
    fireEvent.click(screen.getByRole("button", { name: "I forgot this" }));
    expect(onForgot).toHaveBeenCalledOnce();
  });

  it("renders at most the last 20 history ticks", () => {
    const history = Array.from({ length: 25 }, (_, i) => i % 2 === 0);
    const { container } = render(<WordDetail word={word} history={history} />);
    expect(container.querySelectorAll(".word-detail__tick")).toHaveLength(20);
  });
});
