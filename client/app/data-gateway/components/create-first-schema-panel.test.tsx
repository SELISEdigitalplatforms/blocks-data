import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateFirstSchemaPanel } from "./create-first-schema-panel";

describe("CreateFirstSchemaPanel", () => {
  it("invites the first schema when the project has none", () => {
    render(<CreateFirstSchemaPanel hasSchemas={false} onCreateSchema={vi.fn()} onImportSchema={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Create your first schema" })).toBeInTheDocument();
    expect(screen.queryByText(/GraphQL/)).not.toBeInTheDocument();
  });

  it("asks to select or add a schema once the project has some", () => {
    render(<CreateFirstSchemaPanel hasSchemas onCreateSchema={vi.fn()} onImportSchema={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Select a schema or add a new one" })).toBeInTheDocument();
    expect(screen.queryByText(/your first schema/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New schema/ })).toBeInTheDocument();
  });

  it("names both schema kinds and their examples", () => {
    render(<CreateFirstSchemaPanel hasSchemas={false} onCreateSchema={vi.fn()} onImportSchema={vi.fn()} />);

    expect(screen.getByText("Entity")).toBeInTheDocument();
    expect(screen.getByText("Order · Customer · Product")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
    expect(screen.getByText("OrderItem · Address · TaxLine")).toBeInTheDocument();
  });

  it("passes the clicked kind to onCreateSchema", async () => {
    const user = userEvent.setup();
    const onCreateSchema = vi.fn();
    render(<CreateFirstSchemaPanel hasSchemas={false} onCreateSchema={onCreateSchema} onImportSchema={vi.fn()} />);

    await user.click(screen.getByText("Entity"));
    expect(onCreateSchema).toHaveBeenCalledWith("Entity");

    await user.click(screen.getByText("Child"));
    expect(onCreateSchema).toHaveBeenCalledWith("DTO");
  });

  // The standalone button skips the kind picker entirely — the modal's own
  // default (Entity) covers it, same as it always has.
  it("calls onCreateSchema with no kind from the New schema button", async () => {
    const user = userEvent.setup();
    const onCreateSchema = vi.fn();
    render(<CreateFirstSchemaPanel hasSchemas={false} onCreateSchema={onCreateSchema} onImportSchema={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /New schema/ }));
    expect(onCreateSchema).toHaveBeenCalledWith();
  });

  it("calls onImportSchema from the Import from file button", async () => {
    const user = userEvent.setup();
    const onImportSchema = vi.fn();
    render(<CreateFirstSchemaPanel hasSchemas={false} onCreateSchema={vi.fn()} onImportSchema={onImportSchema} />);

    await user.click(screen.getByRole("button", { name: /Import from file/ }));
    expect(onImportSchema).toHaveBeenCalledTimes(1);
  });
});
