import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SchemaNotFoundPanel } from "./schema-not-found-panel";

describe("SchemaNotFoundPanel", () => {
  it("says the schema is not found, as a status, with a way back (H4)", () => {
    render(<SchemaNotFoundPanel onBackToSchemas={vi.fn()} />);

    const status = screen.getByRole("status");
    expect(status).toContainElement(screen.getByRole("heading", { level: 2, name: "Schema not found" }));
    expect(status).toHaveTextContent("This schema no longer exists or is not part of this project.");
    expect(screen.getByRole("button", { name: "Back to schemas" })).toBeInTheDocument();
  });

  it("goes back to the schemas when the button is used, by mouse or keyboard (H5)", async () => {
    const user = userEvent.setup();
    const onBackToSchemas = vi.fn();
    render(<SchemaNotFoundPanel onBackToSchemas={onBackToSchemas} />);

    // The only focusable element: one Tab reaches it.
    await user.tab();
    expect(screen.getByRole("button", { name: "Back to schemas" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Back to schemas" }));

    expect(onBackToSchemas).toHaveBeenCalledTimes(2);
  });

  // §4: the CreateFirstSchemaPanel shell, a 52px icon tile, and only existing tokens.
  it("uses the empty-state shell and tokens (H14)", () => {
    render(<SchemaNotFoundPanel onBackToSchemas={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveClass("rounded-sm", "border", "border-border/40", "bg-card", "p-8");
    expect(screen.getByRole("status").firstElementChild).toHaveClass("max-w-2xl", "items-center", "text-center");
    expect(screen.getByRole("heading", { name: "Schema not found" })).toHaveClass("text-xl", "font-semibold", "text-foreground");
    expect(screen.getByText("This schema no longer exists or is not part of this project.")).toHaveClass("text-sm", "text-muted-foreground");
    const icon = screen.getByRole("status").querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.parentElement).toHaveClass("h-[52px]", "w-[52px]", "bg-primary/10", "text-primary");
  });
});
