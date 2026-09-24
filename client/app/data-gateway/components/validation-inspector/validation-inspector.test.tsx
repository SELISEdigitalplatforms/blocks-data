import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../schema-fields-validation/schema-field-validation-panel", () => ({
  SchemaFieldValidationPanel: () => <div data-testid="panel" />,
}));

import { ValidationInspector, type ValidationInspectorTarget } from "./validation-inspector";

const target: ValidationInspectorTarget = {
  subject: "Order.Email",
  context: "Field on Order",
  fieldName: "Email",
  schemaId: "s1",
  projectKey: "pk",
};

function renderInspector(over: Partial<Parameters<typeof ValidationInspector>[0]> = {}) {
  const onClose = vi.fn();
  const view = render(<ValidationInspector target={target} onClose={onClose} {...over} />);
  return { onClose, ...view };
}

describe("ValidationInspector", () => {
  // Docked beside the table like AccessInspector, not overlaying it.
  it("names the subject it is showing validations for", () => {
    renderInspector();

    expect(
      screen.getByRole("complementary", { name: "Validations for Order.Email" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Order.Email")).toBeInTheDocument();
    expect(screen.getByText("Field on Order")).toBeInTheDocument();
  });

  // The docked column holds at Access's idle 460px whichever panel is open, so
  // the width lives there — see the shell's test. What matters here is that
  // this panel does not declare a competing one.
  it("fills the width the host gives it rather than declaring its own", () => {
    renderInspector();
    const panel = screen.getByRole("complementary");

    expect(panel.className).toContain("w-full");
    expect(panel.className).not.toMatch(/w-\[\d+px\]/);
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    const { onClose } = renderInspector();

    await user.click(screen.getByRole("button", { name: "Close validation inspector" }));
    expect(onClose).toHaveBeenCalled();
  });
});
