import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPermission } from "@blocks-idp/iam/models/permission";

vi.mock("@blocks-idp/iam/components/permission-group-combobox/permission-group-combobox", () => ({
  PermissionGroupCombobox: ({ value }: { value: string }) => (
    <div data-testid="group-combobox">{value}</div>
  ),
}));
vi.mock("../dependent-permissions", () => ({
  DependentPermissions: () => <div data-testid="dependent-permissions" />,
}));

import { PermissionForm } from "./permission-form";

const values = (over: Partial<IPermission> = {}): IPermission =>
  ({
    name: "Read",
    type: 2,
    resource: "users_read",
    resourceGroup: "grp",
    tags: [],
    description: "",
    dependentPermissions: [],
    permissionSeverity: 1,
    ...over,
  }) as unknown as IPermission;

beforeEach(() => vi.clearAllMocks());

describe("PermissionForm", () => {
  it("renders the field labels", () => {
    render(<PermissionForm onSave={vi.fn()} isPending={false} values={values()} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Resource")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Severity")).toBeInTheDocument();
  });

  it("prefills the name and resource from the provided values", () => {
    render(<PermissionForm onSave={vi.fn()} isPending={false} values={values()} />);
    expect(screen.getByDisplayValue("Read")).toBeInTheDocument();
    expect(screen.getByDisplayValue("users_read")).toBeInTheDocument();
  });

  it("shows the dependent-permissions field only for type 2", () => {
    const { rerender } = render(
      <PermissionForm onSave={vi.fn()} isPending={false} values={values({ type: 2 })} />,
    );
    expect(screen.getByTestId("dependent-permissions")).toBeInTheDocument();
    rerender(
      <PermissionForm onSave={vi.fn()} isPending={false} values={values({ type: 0 })} />,
    );
    expect(screen.queryByTestId("dependent-permissions")).not.toBeInTheDocument();
  });

  it("disables inputs for a built-in permission", () => {
    render(
      <PermissionForm
        onSave={vi.fn()}
        isPending={false}
        values={values({ isBuiltIn: true } as never)}
      />,
    );
    expect(screen.getByDisplayValue("Read")).toBeDisabled();
  });

  it("submits the form values through onSave", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<PermissionForm onSave={onSave} isPending={false} values={values()} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: "Read", resource: "users_read", resourceGroup: "grp" }),
    );
  });

  it("disables Save while a submission is pending", () => {
    render(<PermissionForm onSave={vi.fn()} isPending values={values()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
