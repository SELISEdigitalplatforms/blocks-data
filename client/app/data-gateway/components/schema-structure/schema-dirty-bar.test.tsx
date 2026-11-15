import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SchemaDiff } from "../../utils/schema-diff";
import { SchemaDirtyBar } from "./schema-dirty-bar";

const diff = (over: Partial<SchemaDiff> = {}): SchemaDiff => ({
  changes: [],
  count: 0,
  losesData: false,
  ...over,
});

describe("SchemaDirtyBar", () => {
  it("counts the changes and lists them", () => {
    render(
      <SchemaDirtyBar
        isValid
        diff={diff({
          count: 2,
          changes: [
            { kind: "renamed", from: "Phone", to: "Mobile", attributes: [] },
            { kind: "added", name: "Nickname" },
          ],
        })}
      />,
    );

    expect(screen.getByText("2 unsaved changes")).toBeInTheDocument();
    expect(
      screen.getByText("Phone renamed to Mobile · Nickname added"),
    ).toBeInTheDocument();
  });

  it("uses the singular for one change", () => {
    render(
      <SchemaDirtyBar
        isValid
        diff={diff({ count: 1, changes: [{ kind: "added", name: "Nickname" }] })}
      />,
    );

    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  // Reordering alone dirties the form without changing any field.
  it("falls back to the blast-radius warning when nothing is listed", () => {
    render(<SchemaDirtyBar isValid diff={diff()} />);

    expect(screen.getByText(/affects everywhere they appear/i)).toBeInTheDocument();
  });

  it("holds Save back until the form is valid", () => {
    const { rerender } = render(<SchemaDirtyBar isValid={false} diff={diff()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    rerender(<SchemaDirtyBar isValid diff={diff()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("calls the handler when one is supplied", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SchemaDirtyBar isValid diff={diff()} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalled();
  });

  // Nested tables render inside a div, not a form, and pass a handler instead.
  it("submits the surrounding form when no handler is supplied", () => {
    render(<SchemaDirtyBar isValid diff={diff()} />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });

  // #439 A4: the server refuses an empty structure, so the bar says so before Save is pressed.
  it("says a property is needed and holds Save back when no row is left", () => {
    render(<SchemaDirtyBar isValid isEmpty diff={diff({ count: 2, changes: [{ kind: "removed", name: "street" }] })} />);

    const message = screen.getByRole("status");
    expect(message).toHaveTextContent("Add at least one property before saving.");
    expect(message).toHaveClass("text-destructive");
    // Wraps instead of truncating, so a longer translation is never cut off.
    expect(message).not.toHaveClass("truncate");
    expect(screen.queryByText("street removed")).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-describedby", message.id);
  });

  it("shows the summary and no message while rows remain", () => {
    render(<SchemaDirtyBar isValid diff={diff({ count: 1, changes: [{ kind: "added", name: "Nickname" }] })} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-describedby");
  });

  // #439 A6: a second click during a save would send a second request.
  it("holds Save back while a save is in flight", () => {
    const { rerender } = render(<SchemaDirtyBar isValid isSaving diff={diff()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    rerender(<SchemaDirtyBar isValid isSaving={false} diff={diff()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
