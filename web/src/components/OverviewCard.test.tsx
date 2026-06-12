// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../test/setup";
import { OverviewCard } from "./OverviewCard";

describe("OverviewCard", () => {
  it("renders the whole card as one link to href", () => {
    render(<OverviewCard title="Review" blurb="due today" href="/review" />);
    const link = screen.getByRole("link", { name: /Review/ });
    expect(link.getAttribute("href")).toBe("/review");
  });

  it("renders the title and status blurb", () => {
    render(
      <OverviewCard title="Library" blurb="words in your library" href="/library" />,
    );
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("words in your library")).toBeTruthy();
  });

  it("renders an optional stat in the machine voice", () => {
    const { container } = render(
      <OverviewCard
        title="Review"
        stat="23 due · 4 new"
        blurb="today"
        href="/review"
      />,
    );
    const stat = container.querySelector(".overview-card__stat");
    expect(stat?.textContent).toBe("23 due · 4 new");
  });

  it("applies the zero-state modifier", () => {
    const { container } = render(
      <OverviewCard
        title="Library"
        blurb="No words yet — ingest a PDF to begin"
        href="/library"
        zero
      />,
    );
    expect(
      container.querySelector(".overview-card")?.className,
    ).toContain("overview-card--zero");
  });
});
