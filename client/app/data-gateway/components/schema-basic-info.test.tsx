import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteAsync = vi.fn();
const toast = vi.fn();
const useSchemaIndexes = vi.fn();

vi.mock("./schema-access-control-drawer", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="access-drawer">{trigger}</div>
  ),
}));

vi.mock("../hooks/use-configuration", () => ({
  useDeleteSchema: () => ({ isPending: false, mutateAsync: deleteAsync }),
  useSchemaIndexes: (...a: unknown[]) => useSchemaIndexes(...a),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...a: unknown[]) => toast(...a),
}));

import { SchemaBasicInfo } from "./schema-basic-info";

type Props = Parameters<typeof SchemaBasicInfo>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    id: "s1",
    schemaName: "User",
    schemaType: 1,
    fields: [],
    readAccessLevel: 2,
    writeAccessLevel: 1,
    editAccessLevel: 3,
    deleteAccessLevel: 0,
    schemaReferences: [],
    ...overrides,
  } as Props;
}

describe("SchemaBasicInfo", () => {
  beforeEach(() => {
    deleteAsync.mockReset();
    toast.mockReset();
    useSchemaIndexes.mockReset();
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [] } } });
  });

  it("renders the placeholder info card when no schema is selected", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaName: "" })} />);
    expect(screen.getByText("Basic Information")).toBeInTheDocument();
    expect(
      screen.getByText(/Select a schema from the sidebar/i),
    ).toBeInTheDocument();
  });

  it("renders entity header, access control label and the Schema Access trigger", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);
    expect(screen.getByRole("heading", { name: "User" })).toBeInTheDocument();
    expect(screen.getByText("Entity")).toBeInTheDocument();
    expect(screen.getByText("Access Control")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Schema Access/ }),
    ).toBeInTheDocument();
  });

  // Briefly changed to an even full-width grid, then reverted on request —
  // the pills should size to their own content, not stretch to fill the row.
  it("keeps the access-control pills sized to their content rather than stretched", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);
    const container = screen.getByText("View").closest("div");
    expect(container?.className).not.toContain("grid-cols-4");
    expect(screen.getByText("View").closest("button")?.className).not.toContain("w-full");
  });

  // The header used to say only "Entity" — nothing about the collection
  // behind it or how big the schema is.
  it("summarises the collection, custom/system field split and index count", () => {
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [{}, {}, {}] } } });
    render(
      <SchemaBasicInfo
        {...baseProps({
          collectionName: "users",
          fields: [
            { name: "Email" },
            { name: "ItemId" },
            { name: "CreatedDate" },
          ] as never,
        })}
      />,
    );

    expect(screen.getByText("users")).toBeInTheDocument();
    // ItemId and CreatedDate are default (system) properties on an Entity.
    expect(screen.getByText("1 field · 2 system · 3 indexes")).toBeInTheDocument();
  });

  // Child schemas have no system split and no Indexes tab, so neither belongs
  // in their summary.
  it("counts a Child schema's fields with no system split or index count", () => {
    render(
      <SchemaBasicInfo
        {...baseProps({
          schemaType: 2,
          collectionName: "addresses",
          fields: [{ name: "Street" }, { name: "City" }] as never,
        })}
      />,
    );

    expect(screen.getByText("2 fields")).toBeInTheDocument();
    expect(useSchemaIndexes).toHaveBeenCalledWith("s1", { enabled: false });
  });

  it("shows references and a fallback for a child schema", () => {
    const { rerender } = render(
      <SchemaBasicInfo
        {...baseProps({ schemaType: 2, schemaReferences: ["Order", "Cart"] })}
      />,
    );
    expect(screen.getByText("References")).toBeInTheDocument();
    expect(screen.getByText("Order")).toBeInTheDocument();
    expect(screen.getByText("Cart")).toBeInTheDocument();

    rerender(
      <SchemaBasicInfo {...baseProps({ schemaType: 2, schemaReferences: [] })} />,
    );
    expect(screen.getByText("No references")).toBeInTheDocument();
  });

  it("deletes the schema and reports success on confirm", async () => {
    const user = userEvent.setup();
    deleteAsync.mockResolvedValue({ isSuccess: true });
    const onDeleteSuccess = vi.fn();
    render(<SchemaBasicInfo {...baseProps({ onDeleteSuccess })} />);

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete schema"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteAsync).toHaveBeenCalledWith({ id: "s1", projectKey: "t1" }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success" }),
      ),
    );
    await waitFor(() => expect(onDeleteSuccess).toHaveBeenCalled());
  });
  // The type tag used to sit on its own line below the name; every design
  // board draws it inline beside the name instead.
  it("puts the type tag right beside the schema name, not on its own line", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);

    const heading = screen.getByRole("heading", { name: "User" });
    const tag = screen.getByText("Entity");
    expect(heading.parentElement).toBe(tag.parentElement);
  });
  // The verb ("Create") used to be bare text beside a separately-pilled tier
  // value; every board shares one bordered pill between the two.
  it("shares one pill between the verb and its tier value", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1, writeAccessLevel: 3 })} />);

    expect(screen.getByRole("button", { name: "Create Custom" })).toBeInTheDocument();
  });

  // This card used to have its own bottom border, and SchemaStructureTable
  // its own top border, with a gap between them — two visibly separate
  // cards where the board draws one continuous panel.
  it("drops its own bottom border so it reads as one panel with the table below it", () => {
    const { container } = render(<SchemaBasicInfo {...baseProps()} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain("border-b-0");
    expect(root.className).toContain("rounded-t-sm");
  });

  // Preview used to live down by the tabs, in the field table's own header —
  // moved here to sit beside Schema Access instead.
  it("shows a Preview button beside Schema Access and wires it through", async () => {
    const user = userEvent.setup();
    const onOpenPreview = vi.fn();
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} onOpenPreview={onOpenPreview} />);

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(onOpenPreview).toHaveBeenCalledTimes(1);
  });

  it("hides the Preview button when no handler is given", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });
});
