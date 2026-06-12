// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../test/setup";
import { SiteFooter } from "./SiteFooter";

const links = [
  { label: "Ingest", href: "/ingest" },
  { label: "System", href: "/system" },
];

describe("SiteFooter", () => {
  it("renders utility links from the prop", () => {
    render(<SiteFooter links={links} theme="light" />);
    expect(screen.getByRole("link", { name: "Ingest" }).getAttribute("href")).toBe(
      "/ingest",
    );
  });

  it("renders the live-count meta slot from children", () => {
    render(
      <SiteFooter links={links} theme="light">
        412 words · 61 mature
      </SiteFooter>,
    );
    expect(screen.getByText("412 words · 61 mature")).toBeTruthy();
  });

  it("labels the theme toggle with the current theme word", () => {
    render(<SiteFooter links={links} theme="dark" />);
    expect(screen.getByRole("button", { name: /Dark/ })).toBeTruthy();
  });

  it("fires onToggleTheme when the toggle is pressed", () => {
    const onToggleTheme = vi.fn();
    render(
      <SiteFooter links={links} theme="light" onToggleTheme={onToggleTheme} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Light/ }));
    expect(onToggleTheme).toHaveBeenCalledOnce();
  });
});
