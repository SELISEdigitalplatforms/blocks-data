import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const useGetRoleById = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoleById: (...a: unknown[]) => useGetRoleById(...a),
}));

const getPermissions = vi.fn();
vi.mock("@blocks-idp/iam/services/permission.service", () => ({
  permissionService: {
    getPermissions: (...a: unknown[]) => getPermissions(...a),
  },
}));

import {
  RoleDetailsProvider,
  useRoleDetailsStore,
} from "./role-details-state";

function Consumer() {
  const isInitialized = useRoleDetailsStore((s) => s.isInitialized);
  const permissionMap = useRoleDetailsStore((s) => s.permissionMap);
  const isEditMode = useRoleDetailsStore((s) => s.isEditMode);
  const changeEditMode = useRoleDetailsStore((s) => s.changeEditMode);
  const changePermissionSelection = useRoleDetailsStore(
    (s) => s.changePermissionSelection,
  );
  const changePermissionGroupSelection = useRoleDetailsStore(
    (s) => s.changePermissionGroupSelection,
  );
  const discardChanges = useRoleDetailsStore((s) => s.discardChanges);

  const p = permissionMap.get("r1");
  return (
    <div>
      <span data-testid="init">{String(isInitialized)}</span>
      <span data-testid="edit">{String(isEditMode)}</span>
      <span data-testid="state">{p?.changeState ?? "none"}</span>
      <span data-testid="modified">{String(Boolean(p?.modified))}</span>
      <button onClick={() => changeEditMode(true)}>edit</button>
      <button
        onClick={() =>
          changePermissionSelection([
            { permissionResource: "r1", isChecked: true },
          ])
        }
      >
        add
      </button>
      <button
        onClick={() =>
          p && changePermissionGroupSelection([p], false)
        }
      >
        group-remove
      </button>
      <button onClick={() => discardChanges()}>discard</button>
    </div>
  );
}

function renderWithProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoleDetailsProvider id="role-1" projectKey="p1">
        <Consumer />
      </RoleDetailsProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("RoleDetailsProvider store", () => {
  it("throws when the store is consumed without a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/Missing RoleDetailsProvider/);
    spy.mockRestore();
  });

  it("initializes the permission map and drives selection state", async () => {
    useGetRoleById.mockReturnValue({
      data: { data: { slug: "admin", itemId: "role-1", name: "Admin" } },
    });
    getPermissions.mockResolvedValue({
      data: [
        { resource: "r1", roles: [], dependentPermissions: [] },
        { resource: "r2", roles: ["admin"], dependentPermissions: ["r1"] },
      ],
    });

    renderWithProvider();

    await waitFor(() =>
      expect(screen.getByTestId("init")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("state")).toHaveTextContent("none");

    await userEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("state")).toHaveTextContent("added");
    expect(screen.getByTestId("modified")).toHaveTextContent("true");

    await userEvent.click(screen.getByText("edit"));
    expect(screen.getByTestId("edit")).toHaveTextContent("true");

    await userEvent.click(screen.getByText("discard"));
    expect(screen.getByTestId("state")).toHaveTextContent("none");
    expect(screen.getByTestId("modified")).toHaveTextContent("false");
    expect(screen.getByTestId("edit")).toHaveTextContent("false");
  });

  it("supports group selection changes", async () => {
    useGetRoleById.mockReturnValue({
      data: { data: { slug: "admin", itemId: "role-1", name: "Admin" } },
    });
    getPermissions.mockResolvedValue({
      data: [{ resource: "r1", roles: ["admin"], dependentPermissions: [] }],
    });

    renderWithProvider();

    await waitFor(() =>
      expect(screen.getByTestId("init")).toHaveTextContent("true"),
    );

    await userEvent.click(screen.getByText("group-remove"));
    expect(screen.getByTestId("state")).toHaveTextContent("removed");
    expect(screen.getByTestId("modified")).toHaveTextContent("true");
  });
});
