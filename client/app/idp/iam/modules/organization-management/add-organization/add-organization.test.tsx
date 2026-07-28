import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();
let isPending = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useSaveOrganization: () => ({ mutateAsync, isPending }),
}));

import { AddOrganization } from "./add-organization";

beforeEach(() => {
  vi.clearAllMocks();
  isPending = false;
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

async function openAndType(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: /Add Organization/ }));
  await screen.findByText("Add Organization", { selector: "*[id]" }).catch(() => undefined);
  const input = await screen.findByPlaceholderText("Enter organization name");
  await user.type(input, name);
}

describe("AddOrganization", () => {
  it("renders the trigger button", () => {
    render(<AddOrganization />);
    expect(screen.getByRole("button", { name: /Add Organization/ })).toBeInTheDocument();
  });

  it("keeps the submit disabled until the form is dirty", async () => {
    const user = userEvent.setup();
    render(<AddOrganization />);
    await user.click(screen.getByRole("button", { name: /Add Organization/ }));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("submits and shows a success toast", async () => {
    const user = userEvent.setup();
    render(<AddOrganization />);
    await openAndType(user, "Acme");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectKey: "tenant-abc",
        name: "Acme",
        itemId: "",
        isEnable: true,
      }),
    );
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "Organization added successfully",
    });
  });

  it("shows an error toast when the save is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<AddOrganization />);
    await openAndType(user, "Acme");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("maps a thrown error with an errors field", async () => {
    mutateAsync.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    render(<AddOrganization />);
    await openAndType(user, "Acme");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });
});
