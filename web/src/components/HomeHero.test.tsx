// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../test/setup";
import { HomeHero } from "./HomeHero";

describe("HomeHero", () => {
  it("renders the headword as the page heading", () => {
    render(<HomeHero headword="vergüenza" />);
    const heading = screen.getByRole("heading", { name: "vergüenza" });
    expect(heading.className).toContain("home-hero__headword");
  });

  it("renders the subhead when provided", () => {
    render(<HomeHero headword="vergüenza" subhead="from your library · due today" />);
    expect(screen.getByText("from your library · due today")).toBeTruthy();
  });

  it("renders the primary action slot", () => {
    render(
      <HomeHero
        headword="vergüenza"
        primaryAction={<button>Start review</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Start review" })).toBeTruthy();
  });

  it("omits subhead and action regions when not provided", () => {
    const { container } = render(<HomeHero headword="vergüenza" />);
    expect(container.querySelector(".home-hero__subhead")).toBeNull();
    expect(container.querySelector(".home-hero__action")).toBeNull();
  });
});
