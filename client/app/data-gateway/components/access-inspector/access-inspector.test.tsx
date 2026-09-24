import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./access-inspector-panel", () => ({
  AccessInspectorPanel: ({
    onRuleEditorOpenChange,
  }: {
    onRuleEditorOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="panel">
      <button onClick={() => onRuleEditorOpenChange?.(true)}>open-editor</button>
    </div>
  ),
}));

import { AccessInspector, type AccessInspectorTarget } from "./access-inspector";

const target: AccessInspectorTarget = {
  subject: "Order.Email",
  context: "Field on Order",
  schemaName: "Order",
  schemaId: "s1",
  level: "column",
  fieldNames: ["Email"],
};

function renderInspector(over: Partial<Parameters<typeof AccessInspector>[0]> = {}) {
  const onClose = vi.fn();
  const onRuleEditorOpenChange = vi.fn();
  const view = render(
    <AccessInspector
      target={target}
      onClose={onClose}
      onRuleEditorOpenChange={onRuleEditorOpenChange}
      {...over}
    />,
  );
  return { onClose, onRuleEditorOpenChange, ...view };
}

describe("AccessInspector", () => {
  // The drawer never said which field you had clicked.
  it("names the subject it is showing access for", () => {
    renderInspector();

    expect(screen.getByRole("complementary", { name: "Access for Order.Email" })).toBeInTheDocument();
    expect(screen.getByText("Order.Email")).toBeInTheDocument();
    expect(screen.getByText("Field on Order")).toBeInTheDocument();
  });

  // 460/480 is the docked column's business — it is the thing that animates
  // between them. A width declared here too would be a second source of truth
  // for the same number, and the panel would end up a frame behind the column
  // resizing around it. See the shell's own test for the widths themselves.
  it("fills the width the host gives it rather than declaring its own", () => {
    renderInspector();
    const panel = screen.getByRole("complementary");

    expect(panel.className).toContain("w-full");
    expect(panel.className).not.toMatch(/w-\[\d+px\]/);
  });

  it("passes the rule editor's state up, since the host owns the width", async () => {
    const user = userEvent.setup();
    const { onRuleEditorOpenChange } = renderInspector();

    await user.click(screen.getByText("open-editor"));
    expect(onRuleEditorOpenChange).toHaveBeenCalledWith(true);
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    const { onClose } = renderInspector();

    await user.click(screen.getByRole("button", { name: "Close access inspector" }));
    expect(onClose).toHaveBeenCalled();
  });
});
