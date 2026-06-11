// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../test/setup";
import { ProgressStat } from "./ProgressStat";

describe("ProgressStat", () => {
  it("renders count and unit as a sentence fragment", () => {
    render(<ProgressStat count={23} unit="due today" />);
    expect(screen.getByText("23")).toBeTruthy();
    expect(screen.getByText("due today")).toBeTruthy();
  });

  it("loading renders an em dash", () => {
    render(<ProgressStat count={null} unit="words" />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("zero gets the faint modifier", () => {
    const { container } = render(<ProgressStat count={0} unit="mature" />);
    expect(container.querySelector(".progress-stat--zero")).toBeTruthy();
  });

  it("renders the mono sub-line when given", () => {
    render(<ProgressStat count={84} unit="% average" sub="Last 20 sessions" />);
    expect(screen.getByText("Last 20 sessions")).toBeTruthy();
  });
});
