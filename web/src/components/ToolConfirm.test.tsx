// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../test/setup";
import { ToolConfirm } from "./ToolConfirm";
import type { ChatToolCall, ChatToolReceipt } from "@estudio/shared";

const ADD_TOOL: ChatToolCall = {
  toolName: "add_word_to_deck",
  args: { term: "avergonzarse", deck_id: 1 },
  requiresConfirmation: true,
};

describe("ToolConfirm", () => {
  it("renders pending state with Add and Skip buttons", () => {
    render(
      <ToolConfirm
        toolCall={ADD_TOOL}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText("avergonzarse")).toBeTruthy();
    expect(screen.getByText("Add")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
  });

  it("calls onConfirm when Add is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ToolConfirm
        toolCall={ADD_TOOL}
        onConfirm={onConfirm}
        onSkip={vi.fn()}
      />,
    );
    screen.getByText("Add").click();
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onSkip when Skip is clicked", () => {
    const onSkip = vi.fn();
    render(
      <ToolConfirm
        toolCall={ADD_TOOL}
        onConfirm={vi.fn()}
        onSkip={onSkip}
      />,
    );
    screen.getByText("Skip").click();
    expect(onSkip).toHaveBeenCalled();
  });

  it("renders confirmed receipt", () => {
    const receipt: ChatToolReceipt = {
      toolName: "add_word_to_deck",
      status: "confirmed",
      result: 'Added "avergonzarse" to deck.',
    };
    render(
      <ToolConfirm
        toolCall={ADD_TOOL}
        toolReceipt={receipt}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/ADDED/)).toBeTruthy();
    expect(screen.queryByText("Add")).toBeNull();
  });

  it("renders skipped receipt", () => {
    const receipt: ChatToolReceipt = {
      toolName: "add_word_to_deck",
      status: "skipped",
    };
    render(
      <ToolConfirm
        toolCall={ADD_TOOL}
        toolReceipt={receipt}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/SKIPPED/)).toBeTruthy();
  });
});
