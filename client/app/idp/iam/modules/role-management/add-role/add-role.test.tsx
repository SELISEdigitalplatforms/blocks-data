import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mutateAsyncMock = vi.fn();
const showSuccessToastMock = vi.fn();
const showErrorToastMock = vi.fn();

vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useAddRole: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (args: unknown) => showSuccessToastMock(args),
  showErrorToast: (args: unknown) => showErrorToastMock(args),
}));

import { AddRole } from "./add-role";

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /add role/i }));
  return screen.findByPlaceholderText("Enter name");
}

describe("AddRole form", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue({});
    showSuccessToastMock.mockReset();
    showErrorToastMock.mockReset();
  });

  it("opens the dialog with the submit button disabled until dirty", async () => {
    const user = userEvent.setup();
    render(<AddRole />);

    await openDialog(user);

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("submits a valid role and shows a success toast", async () => {
    const user = userEvent.setup();
    render(<AddRole />);

    const nameInput = await openDialog(user);
    await user.type(nameInput, "Editor");
    await user.type(screen.getByPlaceholderText("Enter slug"), "editor");
    await user.type(screen.getByPlaceholderText("Enter description"), "Can edit");

    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        name: "Editor",
        description: "Can edit",
        slug: "editor",
        projectKey: "tenant-1",
      });
    });
    expect(showSuccessToastMock).toHaveBeenCalledWith({
      description: "Role added successfully",
    });
  });

  it("blocks submission and surfaces a validation error for a missing slug", async () => {
    const user = userEvent.setup();
    render(<AddRole />);

    const nameInput = await openDialog(user);
    await user.type(nameInput, "Editor");

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Slug is required")).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("rejects a slug containing spaces", async () => {
    const user = userEvent.setup();
    render(<AddRole />);

    const nameInput = await openDialog(user);
    await user.type(nameInput, "Editor");
    await user.type(screen.getByPlaceholderText("Enter slug"), "bad slug");

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("Slug can not contain spaces"),
    ).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows an error toast when the mutation rejects", async () => {
    mutateAsyncMock.mockRejectedValue({
      status: 403,
      errors: { name: "nope" },
    });
    const user = userEvent.setup();
    render(<AddRole />);

    const nameInput = await openDialog(user);
    await user.type(nameInput, "Editor");
    await user.type(screen.getByPlaceholderText("Enter slug"), "editor");

    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(showErrorToastMock).toHaveBeenCalledWith({
        title: "Forbidden",
        errors: "You are not allowed to perform this action.",
      });
    });
    expect(showSuccessToastMock).not.toHaveBeenCalled();
  });
});
