import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/** The schema's description in its header (validation and access rules plan, section 7). */

vi.mock("./schema-access-control-drawer", () => ({ default: ({ trigger }: { trigger: React.ReactNode }) => <div>{trigger}</div> }));
const indexes = { data: { data: { indexes: [] } } };
vi.mock("../hooks/use-configuration", () => ({
  useDeleteSchema: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSchemaIndexes: () => indexes,
  usePendingSchemaIds: () => new Set(),
}));
vi.mock("@seliseblocks/genesis-os", () => ({ useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { SchemaBasicInfo } from "./schema-basic-info";

type Props = Parameters<typeof SchemaBasicInfo>[0];
const props = (overrides: Partial<Props>) =>
  ({ id: "s1", schemaName: "Customer", schemaType: 1, fields: [], readAccessLevel: 2, writeAccessLevel: 1, editAccessLevel: 3, deleteAccessLevel: 0, schemaReferences: [], ...overrides }) as Props;

describe("SchemaBasicInfo: description", () => {
  it("shows the description under the name, as plain text", () => {
    render(<SchemaBasicInfo {...props({ description: "<b>Companies</b> we sell to" })} />);
    expect(screen.getByText("<b>Companies</b> we sell to")).toBeInTheDocument();
  });

  it("shows nothing extra without one", () => {
    const { container } = render(<SchemaBasicInfo {...props({})} />);
    expect(container.textContent).not.toContain("undefined");
  });
});
