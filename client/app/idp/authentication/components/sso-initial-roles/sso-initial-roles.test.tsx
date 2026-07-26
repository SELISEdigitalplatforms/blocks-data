import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

let addProps: { onAdd: (r: unknown[]) => void };
vi.mock("./add-sso-role", () => ({
  AddSSORole: (props: { onAdd: (r: unknown[]) => void }) => {
    addProps = props;
    return <button type="button" data-testid="add" onClick={() => props.onAdd([{ slug: "new", name: "New" }])}>add</button>;
  },
}));

let listProps: { roles: Array<{ slug: string }>; onDelete: (r: unknown) => void };
vi.mock("./sso-roles-list", () => ({
  SSORolesList: (props: { roles: Array<{ slug: string }>; onDelete: (r: unknown) => void }) => {
    listProps = props;
    return <div data-testid="list">{props.roles.length} roles</div>;
  },
}));

import { SSOInitialRoles } from "./sso-initial-roles";

const makeRoles = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ slug: `r${i}`, name: `Role ${i}`, itemId: `${i}`, description: "" }));

afterEach(() => vi.clearAllMocks());

describe("SSOInitialRoles", () => {
  it("renders the roles card and passes the first page of roles to the list", () => {
    render(<SSOInitialRoles roles={makeRoles(3) as never} onChange={vi.fn()} />);
    expect(screen.getByText("Roles")).toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("3 roles");
  });

  it("hides pagination when roles fit on one page", () => {
    render(<SSOInitialRoles roles={makeRoles(4) as never} onChange={vi.fn()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows pagination and slices to the page size when there are more roles", () => {
    render(<SSOInitialRoles roles={makeRoles(8) as never} onChange={vi.fn()} />);
    expect(screen.getByTestId("list")).toHaveTextContent("5 roles");
  });

  it("appends roles through the add handler", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SSOInitialRoles roles={makeRoles(1) as never} onChange={onChange} />);
    await user.click(screen.getByTestId("add"));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ slug: "r0" }),
      { slug: "new", name: "New" },
    ]);
    expect(addProps).toBeDefined();
  });

  it("removes a role through the list delete handler", () => {
    const onChange = vi.fn();
    render(<SSOInitialRoles roles={makeRoles(2) as never} onChange={onChange} />);
    listProps.onDelete({ slug: "r0" });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ slug: "r1" })]);
  });
});
