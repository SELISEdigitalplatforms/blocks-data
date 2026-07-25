import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SchemasDrawer } from "./schemas-drawer";

const introspection = {
  data: {
    __schema: {
      queryType: { name: "Query" },
      mutationType: { name: "Mutation" },
      types: [
        {
          name: "Query",
          kind: "OBJECT",
          fields: [
            {
              name: "getUser",
              args: [],
              description: "",
              type: { kind: "OBJECT", name: "User", ofType: null },
            },
          ],
        },
        {
          name: "Mutation",
          kind: "OBJECT",
          fields: [
            {
              name: "createUser",
              args: [],
              description: "",
              type: { kind: "OBJECT", name: "User", ofType: null },
            },
          ],
        },
        {
          name: "User",
          kind: "OBJECT",
          fields: [
            {
              name: "id",
              args: [],
              type: { kind: "SCALAR", name: "String", ofType: null },
            },
          ],
        },
      ],
    },
  },
};

function renderDrawer(props: Partial<Parameters<typeof SchemasDrawer>[0]> = {}) {
  const onUseQuery = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <SchemasDrawer
      open
      onOpenChange={onOpenChange}
      data={introspection}
      isLoading={false}
      onUseQuery={onUseQuery}
      {...props}
    />,
  );
  return { onUseQuery, onOpenChange };
}

describe("SchemasDrawer", () => {
  it("shows the spinner while loading", () => {
    renderDrawer({ isLoading: true, data: undefined });
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("shows an empty message when there is no introspection data", () => {
    renderDrawer({ data: undefined });
    expect(screen.getByText("No schema data available")).toBeInTheDocument();
  });

  it("categorizes queries, mutations and types from the introspection", () => {
    renderDrawer();
    expect(screen.getByText("Queries")).toBeInTheDocument();
    expect(screen.getByText("Mutations")).toBeInTheDocument();
    expect(screen.getByText("getUser")).toBeInTheDocument();
    expect(screen.getByText("createUser")).toBeInTheDocument();
    // The User object type appears (as a return type annotation and Types entry)
    expect(screen.getAllByText("User").length).toBeGreaterThan(0);
    expect(screen.getByText("Types")).toBeInTheDocument();
  });

  it("emits a generated query when 'Use in Query Editor' is clicked", async () => {
    const user = userEvent.setup();
    const { onUseQuery } = renderDrawer();

    const [useBtn] = screen.getAllByTitle("Use in Query Editor");
    await user.click(useBtn);
    expect(onUseQuery).toHaveBeenCalledWith(expect.stringContaining("getUser"));
  });

  it("filters operations by the search box", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(
      screen.getByPlaceholderText("Search types, fields..."),
      "createUser",
    );
    expect(screen.getByText("createUser")).toBeInTheDocument();
    expect(screen.queryByText("getUser")).not.toBeInTheDocument();
  });
});

const richIntrospection = {
  data: {
    __schema: {
      queryType: { name: "Query" },
      mutationType: { name: "Mutation" },
      types: [
        {
          name: "Query",
          kind: "OBJECT",
          fields: [
            {
              name: "getWidget",
              description: "Fetch a widget",
              args: [{ name: "id", type: { kind: "SCALAR", name: "ID", ofType: null } }],
              type: { kind: "OBJECT", name: "WidgetResult", ofType: null },
            },
          ],
        },
        {
          name: "Mutation",
          kind: "OBJECT",
          fields: [
            {
              name: "saveWidget",
              args: [{ name: "name", type: { kind: "SCALAR", name: "String", ofType: null } }],
              type: { kind: "OBJECT", name: "Widget", ofType: null },
            },
          ],
        },
        {
          name: "WidgetResult",
          kind: "OBJECT",
          fields: [
            { name: "items", args: [], type: { kind: "LIST", name: null, ofType: { kind: "OBJECT", name: "Widget", ofType: null } } },
            { name: "totalCount", args: [], type: { kind: "SCALAR", name: "Int", ofType: null } },
          ],
        },
        {
          name: "Widget",
          kind: "OBJECT",
          fields: [
            { name: "id", args: [], type: { kind: "SCALAR", name: "ID", ofType: null } },
            { name: "name", args: [], type: { kind: "SCALAR", name: "String", ofType: null } },
          ],
        },
        {
          name: "StandaloneInput",
          kind: "INPUT_OBJECT",
          inputFields: [
            { name: "term", type: { kind: "SCALAR", name: "String", ofType: null }, defaultValue: '"x"' },
            { name: "nested", type: { kind: "INPUT_OBJECT", name: "NestedInput", ofType: null } },
          ],
        },
        {
          name: "NestedInput",
          kind: "INPUT_OBJECT",
          inputFields: [{ name: "deep", type: { kind: "SCALAR", name: "String", ofType: null } }],
        },
        {
          name: "Status",
          kind: "ENUM",
          enumValues: [
            { name: "ACTIVE", description: "on" },
            { name: "INACTIVE", isDeprecated: true },
          ],
        },
        { name: "DateTime", kind: "SCALAR", description: "an instant" },
      ],
    },
  },
};

describe("SchemasDrawer (rich schema exploration)", () => {
  const renderRich = () =>
    render(
      <SchemasDrawer
        open
        onOpenChange={vi.fn()}
        data={richIntrospection}
        isLoading={false}
        onUseQuery={vi.fn()}
      />,
    );

  it("renders every category section from a full introspection", () => {
    renderRich();
    expect(screen.getByText("Queries")).toBeInTheDocument();
    expect(screen.getByText("Result Types")).toBeInTheDocument();
    expect(screen.getByText("Input Types")).toBeInTheDocument();
    expect(screen.getByText("Enums")).toBeInTheDocument();
    expect(screen.getByText("Scalars")).toBeInTheDocument();
    // Argument list is formatted in the collapsed operation header.
    expect(screen.getByText("(id: ID)")).toBeInTheDocument();
  });

  it("expands an operation to show its arguments and return fields", async () => {
    const user = userEvent.setup();
    renderRich();
    await user.click(screen.getByText("getWidget"));
    expect(await screen.findByText("Arguments")).toBeInTheDocument();
    expect(screen.getByText("Returns:")).toBeInTheDocument();
    // Return type WidgetResult fields appear via InlineTypeFields.
    expect(screen.getByText("items")).toBeInTheDocument();
    expect(screen.getByText("totalCount")).toBeInTheDocument();
  });

  it("expands an input type to reveal its input fields", async () => {
    const user = userEvent.setup();
    renderRich();
    await user.click(screen.getByText("StandaloneInput"));
    expect(await screen.findByText("term")).toBeInTheDocument();
    expect(screen.getByText("nested")).toBeInTheDocument();
    // Default value annotation renders for input fields.
    expect(screen.getByText('= "x"')).toBeInTheDocument();
  });

  it("opens the enums section and expands an enum's values", async () => {
    const user = userEvent.setup();
    renderRich();
    await user.click(screen.getByText("Enums"));
    await user.click(await screen.findByText("Status"));
    expect(await screen.findByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("INACTIVE")).toBeInTheDocument();
  });

  it("collapses a section when its header is toggled", async () => {
    const user = userEvent.setup();
    renderRich();
    expect(screen.getByText("getWidget")).toBeInTheDocument();
    await user.click(screen.getByText("Queries"));
    expect(screen.queryByText("getWidget")).not.toBeInTheDocument();
  });
});
