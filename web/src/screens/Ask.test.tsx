// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../test/setup";
import { Ask } from "./Ask";

vi.mock("./askApi", () => ({
  createThread: vi.fn(),
  listThreads: vi.fn(),
  getThread: vi.fn(),
  postMessage: vi.fn(),
  confirmTool: vi.fn(),
}));

import * as askApi from "./askApi";

const THREAD = {
  id: 1,
  pageContext: { kind: "home" as const, label: "Ask" },
  title: "Ask",
  createdAt: "2026-06-11T10:00:00Z",
  updatedAt: "2026-06-11T10:00:00Z",
  preview: "",
};

const USER_MSG = {
  id: 1,
  threadId: 1,
  role: "user" as const,
  content: "Why is vergüenza reflexive?",
  createdAt: "2026-06-11T10:01:00Z",
};

const ASSISTANT_MSG = {
  id: 2,
  threadId: 1,
  role: "assistant" as const,
  content: "Because avergonzarse is reflexive by nature.",
  createdAt: "2026-06-11T10:01:01Z",
};

const ORIGINAL_LOCATION = window.location;

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: { ...ORIGINAL_LOCATION, href: "/ask", pathname: "/ask", search: "" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: ORIGINAL_LOCATION,
    writable: true,
    configurable: true,
  });
});

describe("Ask — thread list", () => {
  it("shows empty state when no threads", async () => {
    vi.mocked(askApi.listThreads).mockResolvedValue({
      threads: [],
      hasMore: false,
    });
    render(<Ask />);
    await waitFor(() =>
      expect(screen.getByText(/No conversations yet/)).toBeTruthy(),
    );
  });

  it("shows threads in the list", async () => {
    vi.mocked(askApi.listThreads).mockResolvedValue({
      threads: [
        {
          ...THREAD,
          preview: "Why is vergüenza reflexive?",
        },
      ],
      hasMore: false,
    });
    render(<Ask />);
    await waitFor(() =>
      expect(screen.getByText("Why is vergüenza reflexive?")).toBeTruthy(),
    );
  });
});

describe("Ask — thread view (new=1)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { ...ORIGINAL_LOCATION, href: "/ask?new=1", pathname: "/ask", search: "?new=1" },
      writable: true,
      configurable: true,
    });
    vi.mocked(askApi.createThread).mockResolvedValue({ thread: THREAD });
  });

  it("creates a thread on mount when ?new=1", async () => {
    render(<Ask />);
    await waitFor(() => expect(askApi.createThread).toHaveBeenCalled());
  });

  it("sends a message and shows the response", async () => {
    vi.mocked(askApi.postMessage).mockResolvedValue({
      userMessage: USER_MSG,
      assistantMessage: ASSISTANT_MSG,
    });

    render(<Ask />);
    await waitFor(() => expect(askApi.createThread).toHaveBeenCalled());

    const input = screen.getByPlaceholderText("Ask a question…");
    fireEvent.change(input, {
      target: { value: "Why is vergüenza reflexive?" },
    });
    const sendBtn = screen.getByText("Send");
    fireEvent.click(sendBtn);

    await waitFor(() =>
      expect(
        screen.getByText("Because avergonzarse is reflexive by nature."),
      ).toBeTruthy(),
    );
  });
});
