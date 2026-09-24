import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../schema-access-control/schema-access-control-view", () => ({
  SchemaAccessControlView: ({ operation }: { operation: number }) => (
    <div data-testid="view">op:{operation}</div>
  ),
}));

import { AccessInspectorPanel } from "./access-inspector-panel";

describe("AccessInspectorPanel", () => {
  // Each verb tab used to give no hint of who could do that thing until you
  // clicked into it. A coloured dot answers "is this locked down?" at a glance.
  it("shows a tier dot per verb tab, resolved from that verb's own access level", () => {
    render(
      <AccessInspectorPanel
        schemaName="Order"
        schemaId="s1"
        level="row"
        readAccessLevel={1}
        writeAccessLevel={3}
        editAccessLevel={2}
        deleteAccessLevel={0}
      />,
    );

    expect(screen.getByTitle("Logged-in users")).toBeInTheDocument(); // View → read → 1
    expect(screen.getByTitle("Custom")).toBeInTheDocument(); // Create → write → 3
    expect(screen.getByTitle("Public")).toBeInTheDocument(); // Edit → edit → 2
    expect(screen.getByTitle("Inherited")).toBeInTheDocument(); // Delete → delete → 0
  });

  // The tabs used to pack to the left with dead space trailing off; they now
  // split the full row width evenly across the four verbs.
  it("stretches the verb tabs to fill the full width evenly", () => {
    render(
      <AccessInspectorPanel schemaName="Order" schemaId="s1" level="row" />,
    );
    const tab = screen.getByRole("tab", { name: /View/ });
    expect(tab.className).toContain("flex-1");
    expect(tab.parentElement?.className).toContain("w-full");
  });

  it("resolves a column's tab dot from the matching field rather than the schema-level props", () => {
    render(
      <AccessInspectorPanel
        schemaName="Order"
        schemaId="s1"
        level="column"
        fieldNames={["Email"]}
        fields={[
          {
            name: "Email",
            readAccessLevel: 2,
          } as never,
        ]}
      />,
    );

    expect(screen.getByTitle("Public")).toBeInTheDocument();
  });
});
