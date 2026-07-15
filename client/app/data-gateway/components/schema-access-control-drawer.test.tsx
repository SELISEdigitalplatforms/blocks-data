import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The per-tab content pulls in query/store hooks — stub it and echo its props.
vi.mock("./schema-access-control/schema-access-control-view", () => ({
  SchemaAccessControlView: ({
    level,
    operation,
  }: {
    level: string;
    operation: number;
  }) => (
    <div data-testid="access-view">
      level:{level}|op:{operation}
    </div>
  ),
}));

import SchemaAccessControlDrawer from "./schema-access-control-drawer";

function renderDrawer(props: Partial<Parameters<typeof SchemaAccessControlDrawer>[0]> = {}) {
  render(
    <SchemaAccessControlDrawer
      schemaName="User"
      schemaId="s1"
      level="row"
      open
      onOpenChange={vi.fn()}
      {...props}
    />,
  );
}

describe("SchemaAccessControlDrawer", () => {
  it("renders the title and all four action tabs for row-level access", () => {
    renderDrawer({ title: "Access for User" });
    expect(screen.getByText("Access for User")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Delete" })).toBeInTheDocument();
  });

  it("hides the Delete tab for column-level access", () => {
    renderDrawer({ level: "column" });
    expect(screen.queryByRole("tab", { name: "Delete" })).not.toBeInTheDocument();
    // Active view echoes the level it received
    expect(screen.getByTestId("access-view")).toHaveTextContent("level:column");
  });

  it("defaults to the View tab and renders its access view", () => {
    renderDrawer();
    expect(screen.getByRole("tab", { name: "View" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("access-view")).toBeInTheDocument();
  });

  it("honours the selectedTab prop", () => {
    renderDrawer({ selectedTab: "Edit" });
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("switches tabs on click", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole("tab", { name: "Create" }));
    expect(screen.getByRole("tab", { name: "Create" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
