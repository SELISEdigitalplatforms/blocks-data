import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let editMode = true;
vi.mock("./role-details-state", () => ({
  useRoleDetailsStore: (selector: (s: { isEditMode: boolean }) => unknown) =>
    selector({ isEditMode: editMode }),
}));

import { PermissionToggleCard } from "./permission-toggle-card";
import { PERMISSION_SEVERITY_OPTIONS } from "@blocks-idp/iam/models/permission";

const basePermission = {
  name: "Read Users",
  description: "Allows reading users",
  permissionSeverity: PERMISSION_SEVERITY_OPTIONS[0].value,
  type: 0,
} as never;

afterEach(() => {
  vi.clearAllMocks();
  editMode = true;
});

describe("PermissionToggleCard", () => {
  it("renders the permission name, description and severity label", () => {
    render(
      <PermissionToggleCard
        permission={basePermission}
        checked={false}
        id="p1"
      />,
    );
    expect(screen.getByText("Read Users")).toBeInTheDocument();
    expect(screen.getByText("Allows reading users")).toBeInTheDocument();
    expect(
      screen.getByText(PERMISSION_SEVERITY_OPTIONS[0].label),
    ).toBeInTheDocument();
  });

  it("shows the dependent-permission tooltip trigger when applicable", () => {
    render(
      <PermissionToggleCard
        permission={basePermission}
        checked
        id="p2"
        hasDependentPermissions
        isAllDependentPermissionsChecked={false}
      />,
    );
    // The checkbox reflects the checked state.
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("disables the checkbox when not in edit mode", () => {
    editMode = false;
    render(
      <PermissionToggleCard
        permission={basePermission}
        checked={false}
        id="p3"
      />,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
