import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteAsync = vi.fn();
const toast = vi.fn();

vi.mock("./schema-access-control-drawer", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="access-drawer">{trigger}</div>
  ),
}));

vi.mock("../hooks/use-configuration", () => ({
  useDeleteSchema: () => ({ isPending: false, mutateAsync: deleteAsync }),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
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
});
