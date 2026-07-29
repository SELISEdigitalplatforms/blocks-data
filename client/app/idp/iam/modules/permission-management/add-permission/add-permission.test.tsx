import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => navigate }));

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useAddPermission: () => ({ isPending, mutateAsync }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("@/components/breadcrumb/breadcrumb", () => ({ default: () => <nav /> }));
vi.mock("../permission-form", () => ({
  PermissionForm: ({ onSave }: { onSave: (d: unknown) => void }) => (
    <button data-testid="save" onClick={() => onSave({ type: "1", dependentPermissions: ["d1"], name: "Read" })}>
      save
    </button>
  ),
}));

import { AddPermission } from "./add-permission";

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("AddPermission", () => {
  it("renders the new-permission heading and form", () => {
    render(<AddPermission />);
    expect(screen.getByText("New Permission")).toBeInTheDocument();
    expect(screen.getByTestId("save")).toBeInTheDocument();
  });

  it("creates a permission and navigates to the permissions tab on success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    render(<AddPermission />);
    await user.click(screen.getByTestId("save"));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 1,
          projectKey: "tenant-1",
          isBuiltIn: false,
          dependentPermissions: [],
        }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/services/iam?tab=permissions");
  });

  it("shows an error toast when the API reports failure", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { name: "bad" } });
    render(<AddPermission />);
    await user.click(screen.getByTestId("save"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { name: "bad" } }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows a fallback error toast when the request throws", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue("weird");
    render(<AddPermission />);
    await user.click(screen.getByTestId("save"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
  });
});
