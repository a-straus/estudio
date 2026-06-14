// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("renders the range sentence", () => {
    render(
      <Pagination
        total={100}
        limit={50}
        offset={0}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText("1–50 of 100 words")).toBeTruthy();
  });

  it("renders nothing when total <= limit", () => {
    const { container } = render(
      <Pagination
        total={50}
        limit={50}
        offset={0}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when total < limit", () => {
    const { container } = render(
      <Pagination
        total={10}
        limit={50}
        offset={0}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("disables Previous on the first page", () => {
    render(
      <Pagination
        total={100}
        limit={50}
        offset={0}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    const prev = screen.getByRole("button", { name: "‹ Previous" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next ›" }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it("disables Next on the last page", () => {
    render(
      <Pagination
        total={100}
        limit={50}
        offset={50}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    const prev = screen.getByRole("button", { name: "‹ Previous" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next ›" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(prev.disabled).toBe(false);
  });

  it("shows the correct range on the second page", () => {
    render(
      <Pagination
        total={325}
        limit={50}
        offset={50}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText("51–100 of 325 words")).toBeTruthy();
  });

  it("clamps the range end to total on the last partial page", () => {
    render(
      <Pagination
        total={325}
        limit={50}
        offset={300}
        onPrev={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText("301–325 of 325 words")).toBeTruthy();
  });

  it("calls onPrev when Previous is clicked", () => {
    const onPrev = vi.fn();
    render(
      <Pagination
        total={100}
        limit={50}
        offset={50}
        onPrev={onPrev}
        onNext={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "‹ Previous" }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("calls onNext when Next is clicked", () => {
    const onNext = vi.fn();
    render(
      <Pagination
        total={100}
        limit={50}
        offset={0}
        onPrev={() => {}}
        onNext={onNext}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next ›" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
