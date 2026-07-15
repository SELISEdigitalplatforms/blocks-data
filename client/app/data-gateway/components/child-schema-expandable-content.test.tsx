import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSchemaDetails = vi.fn();

vi.mock("../hooks/use-configuration", () => ({
  useSchemaDetails: (...args: unknown[]) => useSchemaDetails(...args),
}));

// Echo the props SchemaStructureTable receives so we can assert the merge /
// passthrough logic performed by ChildSchemaExpandableContent.
vi.mock("./schema-structure", () => ({
  default: (props: {
    fields?: Array<{ name: string; readAccessLevel?: number }>;
    isLoading?: boolean;
    ancestorPath?: string[];
    rootSchemaId?: string;
    policyEntitySchemaName?: string;
    hideAccessValidation?: boolean;
    compactView?: boolean;
  }) => (
    <div data-testid="schema-structure">
      <span data-testid="ss-fields">
        {JSON.stringify((props.fields ?? []).map((f) => f.name))}
      </span>
      <span data-testid="ss-loading">{String(props.isLoading)}</span>
      <span data-testid="ss-ancestor">{JSON.stringify(props.ancestorPath)}</span>
      <span data-testid="ss-root">{String(props.rootSchemaId)}</span>
      <span data-testid="ss-policy">{String(props.policyEntitySchemaName)}</span>
      <span data-testid="ss-hide">{String(props.hideAccessValidation)}</span>
      <span data-testid="ss-compact">{String(props.compactView)}</span>
      <span data-testid="ss-access">
        {JSON.stringify(
          (props.fields ?? []).map((f) => ({
            name: f.name,
            readAccessLevel: f.readAccessLevel,
          })),
        )}
      </span>
    </div>
  ),
}));

import { ChildSchemaExpandableContent } from "./child-schema-expandable-content";

type RemoteField = {
  name: string;
  type: string;
  isArray: boolean;
  readAccessLevel?: number;
};

function schemaResult(fields: RemoteField[], overrides: Record<string, unknown> = {}) {
  return {
    id: "child-1",
    schemaName: "Address",
    schemaType: 2,
    collectionName: "address",
    fields,
    totalPermissions: 0,
    totalRoles: 0,
    totalUsers: 0,
    projectShortKey: "short",
    totalSchemaReferences: 0,
    schemaReferences: [],
    readAccessLevel: 1,
    writeAccessLevel: 1,
    editAccessLevel: 1,
    deleteAccessLevel: 1,
    ...overrides,
  };
}

beforeEach(() => {
  useSchemaDetails.mockReset();
});

describe("ChildSchemaExpandableContent", () => {
  it("renders SchemaStructureTable with an empty field list before data loads", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(<ChildSchemaExpandableContent schemaId="s1" projectKey="p1" />);

    expect(screen.getByTestId("schema-structure")).toBeInTheDocument();
    expect(screen.getByTestId("ss-fields")).toHaveTextContent("[]");
    expect(screen.getByTestId("ss-loading")).toHaveTextContent("false");
    // compactView is always forced on for the embedded child table.
    expect(screen.getByTestId("ss-compact")).toHaveTextContent("true");
  });

  it("passes the loading flag straight through", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: true });
    render(<ChildSchemaExpandableContent schemaId="s1" projectKey="p1" />);

    expect(screen.getByTestId("ss-loading")).toHaveTextContent("true");
  });

  it("normalizes and forwards fields from the fetched schema", () => {
    useSchemaDetails.mockReturnValue({
      data: {
        data: schemaResult([
          { name: "street", type: "String", isArray: false },
          { name: "city", type: "String", isArray: false },
        ]),
      },
      isLoading: false,
    });
    render(<ChildSchemaExpandableContent schemaId="s1" projectKey="p1" />);

    expect(screen.getByTestId("ss-fields")).toHaveTextContent(
      JSON.stringify(["street", "city"]),
    );
    // policyEntitySchemaName defaults to the fetched schema's name.
    expect(screen.getByTestId("ss-policy")).toHaveTextContent("Address");
  });

  it("derives ancestorPath from parentPropertyName when no explicit path is given", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(
      <ChildSchemaExpandableContent
        schemaId="s1"
        projectKey="p1"
        parentPropertyName="Assignee"
      />,
    );

    expect(screen.getByTestId("ss-ancestor")).toHaveTextContent(
      JSON.stringify(["Assignee"]),
    );
  });

  it("prefers an explicit ancestorPath over parentPropertyName", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(
      <ChildSchemaExpandableContent
        schemaId="s1"
        projectKey="p1"
        ancestorPath={["B", "C"]}
        parentPropertyName="Assignee"
      />,
    );

    expect(screen.getByTestId("ss-ancestor")).toHaveTextContent(
      JSON.stringify(["B", "C"]),
    );
  });

  it("falls back to parentSchemaId for rootSchemaId", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(
      <ChildSchemaExpandableContent
        schemaId="s1"
        projectKey="p1"
        parentSchemaId="root-99"
      />,
    );

    expect(screen.getByTestId("ss-root")).toHaveTextContent("root-99");
  });

  it("prefers rootSchemaId over parentSchemaId", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(
      <ChildSchemaExpandableContent
        schemaId="s1"
        projectKey="p1"
        rootSchemaId="root-1"
        parentSchemaId="root-99"
      />,
    );

    expect(screen.getByTestId("ss-root")).toHaveTextContent("root-1");
  });

  it("merges parent nested field access levels into child fields by name", () => {
    useSchemaDetails.mockReturnValue({
      data: {
        data: schemaResult([
          { name: "password", type: "String", isArray: false, readAccessLevel: 1 },
        ]),
      },
      isLoading: false,
    });
    render(
      <ChildSchemaExpandableContent
        schemaId="s1"
        projectKey="p1"
        parentFieldWithNested={{ fields: [{ name: "password", readAccessLevel: 5 }] }}
      />,
    );

    // The parent's access level (5) overrides the child's (1).
    expect(screen.getByTestId("ss-access")).toHaveTextContent(
      JSON.stringify([{ name: "password", readAccessLevel: 5 }]),
    );
  });

  it("synthesizes fields from parent nested data when the child has none", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(
      <ChildSchemaExpandableContent
        schemaId="s1"
        projectKey="p1"
        parentFieldWithNested={{ fields: [{ name: "token", readAccessLevel: 3 }] }}
      />,
    );

    expect(screen.getByTestId("ss-fields")).toHaveTextContent(
      JSON.stringify(["token"]),
    );
  });

  it("passes hideAccessValidation through to the table", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(
      <ChildSchemaExpandableContent schemaId="s1" projectKey="p1" hideAccessValidation />,
    );

    expect(screen.getByTestId("ss-hide")).toHaveTextContent("true");
  });

  it("uses an explicit policyEntitySchemaName when provided", () => {
    useSchemaDetails.mockReturnValue({ data: undefined, isLoading: false });
    render(
      <ChildSchemaExpandableContent
        schemaId="s1"
        projectKey="p1"
        policyEntitySchemaName="Policy"
      />,
    );

    expect(screen.getByTestId("ss-policy")).toHaveTextContent("Policy");
  });
});
