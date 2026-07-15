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
