import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

let segments: { href: string; label: string }[];
vi.mock("@/hooks/use-path-segments", () => ({
  default: () => segments,
}));

import PageBreadcrumb from "./breadcrumb";

const renderCrumb = (props = {}) =>
  render(
    <MemoryRouter>
      <PageBreadcrumb {...props} />
    </MemoryRouter>,
  );

afterEach(() => vi.clearAllMocks());

describe("PageBreadcrumb", () => {
  it("renders a link for intermediate segments and a page for the last", () => {
    segments = [
      { href: "/console", label: "Console" },
      { href: "/console/users", label: "Users" },
    ];
    renderCrumb();
    const link = screen.getByRole("link", { name: "Console" });
    expect(link).toHaveAttribute("href", "/console");
    // The final segment renders as the current page (aria-current), not a nav link.
    const current = screen.getByText("Users");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("slices the trail when a breadcrumbIndex is provided", () => {
    segments = [
      { href: "/a", label: "A" },
      { href: "/b", label: "B" },
      { href: "/c", label: "C" },
    ];
    renderCrumb({ breadcrumbIndex: 2 });
    // With index 2 the list starts at slice(1): B, C.
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
