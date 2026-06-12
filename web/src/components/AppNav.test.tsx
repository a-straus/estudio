// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../test/setup";
import { AppNav } from "./AppNav";

describe("AppNav", () => {
  it("renders all four nav items", () => {
    render(<AppNav activeHref="/" />);
    expect(screen.getByRole("link", { name: /Home/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Review/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Library/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Grammar/ })).toBeTruthy();
  });

  it("marks the active item with aria-current and the active class", () => {
    render(<AppNav activeHref="/review" />);
    const reviewLink = screen.getByRole("link", { name: /Review/ });
    expect(reviewLink.getAttribute("aria-current")).toBe("page");
    expect(reviewLink.className).toContain("app-nav__item--active");
  });

  it("does not mark other items as active", () => {
    render(<AppNav activeHref="/review" />);
    const homeLink = screen.getByRole("link", { name: /Home/ });
    expect(homeLink.getAttribute("aria-current")).toBeNull();
    expect(homeLink.className).not.toContain("app-nav__item--active");
  });

  it("items have correct hrefs", () => {
    render(<AppNav activeHref="/" />);
    expect(screen.getByRole("link", { name: /Home/ }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /Library/ }).getAttribute("href")).toBe("/library");
    expect(screen.getByRole("link", { name: /Grammar/ }).getAttribute("href")).toBe("/grammar");
  });
});
