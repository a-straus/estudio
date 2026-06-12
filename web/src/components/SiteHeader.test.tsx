// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { SiteHeader } from "./SiteHeader";

const nav = [
  { label: "Home", href: "/", active: true },
  { label: "Review", href: "/review" },
  { label: "Library", href: "/library" },
];

describe("SiteHeader", () => {
  it("renders the screen title as the masthead", () => {
    const { container } = render(<SiteHeader title="Today" nav={nav} />);
    const title = container.querySelector(".site-header__title");
    expect(title?.textContent).toBe("Today");
  });

  it("renders nav items from the prop with hrefs", () => {
    render(<SiteHeader title="Home" nav={nav} />);
    const review = screen.getByRole("link", { name: "Review" });
    expect(review.getAttribute("href")).toBe("/review");
  });

  it("marks the active item with aria-current and the active class", () => {
    render(<SiteHeader title="Home" nav={nav} />);
    const home = screen.getByRole("link", { name: "Home" });
    expect(home.getAttribute("aria-current")).toBe("page");
    expect(home.className).toContain("site-header__link--active");
  });

  it("fires onAsk when the Ask button is pressed", () => {
    const onAsk = vi.fn();
    render(<SiteHeader title="Home" nav={nav} onAsk={onAsk} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(onAsk).toHaveBeenCalledOnce();
  });

  it("does not render the + Add button when onQuickAdd is not provided", () => {
    render(<SiteHeader title="Home" nav={nav} />);
    expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  });

  it("renders the + Add button when onQuickAdd is provided", () => {
    render(<SiteHeader title="Home" nav={nav} onQuickAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ Add" })).toBeTruthy();
  });

  it("fires onQuickAdd when the + Add button is clicked", () => {
    const onQuickAdd = vi.fn();
    render(<SiteHeader title="Home" nav={nav} onQuickAdd={onQuickAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(onQuickAdd).toHaveBeenCalledOnce();
  });
});
