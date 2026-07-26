import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/copy-to-clipboard-button", () => ({
  CopyToClipboardButton: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/masked-text", () => ({
  MaskedText: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock("@/constants/environment-options", () => ({
  environmentOptions: [{ value: "staging", label: "Staging" }],
}));

import { ProjectDetail } from "./project-detail";

describe("ProjectDetail", () => {
  it("renders a loading skeleton when isLoading is true", () => {
    const { container } = render(<ProjectDetail isLoading />);
    // No labels rendered while loading.
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
    expect(container.querySelector("div")).toBeInTheDocument();
  });

  it("renders project details including slug and a Production button", () => {
    render(
      <ProjectDetail
        isLoading={false}
        project={
          {
            name: "My Project",
            tenantId: "tenant-abc",
            tenantSlug: "slug-1",
            environment: "prod",
            createdDate: "2024-01-01T00:00:00Z",
            lastUpdatedDate: "2024-02-01T00:00:00Z",
          } as never
        }
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(screen.getByText("Project Slug")).toBeInTheDocument();
    expect(screen.getByText("slug-1")).toBeInTheDocument();
    expect(screen.getByText("tenant-abc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Production" })).toBeInTheDocument();
  });

  it("omits the slug row and maps a non-prod environment label", () => {
    render(
      <ProjectDetail
        isLoading={false}
        project={
          {
            name: "Other",
            tenantId: "t2",
            environment: "staging",
          } as never
        }
      />,
    );
    expect(screen.queryByText("Project Slug")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Staging" })).toBeInTheDocument();
  });
});
