import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IRole } from "@blocks-idp/iam/models/role";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const saveServiceClient = vi.fn();
let isErr = false;
let rolesData: unknown;
let isLoading = false;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/authentication/hooks/use-auth-clients", () => ({
  useSaveAuthClient: () => ({ mutateAsync: saveServiceClient, isPending: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => ({ data: rolesData, isLoading }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));

import { CreateClientCredential } from "./create-client-credential";

const role = (slug: string): IRole => ({ itemId: slug, name: slug, slug }) as IRole;

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Create"));
  await screen.findByText("New Access Token");
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  isLoading = false;
  rolesData = { data: [role("admin"), role("viewer")] };
  saveServiceClient.mockResolvedValue({ isSuccess: true });
});

describe("CreateClientCredential", () => {
  it("renders the trigger", () => {
    render(<CreateClientCredential />);
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("opens the dialog with its fields and roles", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CreateClientCredential />);
    await open(user);
    expect(screen.getByText("Client Name")).toBeInTheDocument();
    expect(screen.getByText("Audience")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("viewer")).toBeInTheDocument();
  });

  it("shows a placeholder when no roles match", async () => {
    rolesData = { data: [] };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CreateClientCredential />);
    await open(user);
    expect(screen.getByText("No roles found")).toBeInTheDocument();
  });

  it("keeps Add disabled until the form is dirty", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CreateClientCredential />);
    await open(user);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("creates a client with the chosen name and roles", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CreateClientCredential />);
    await open(user);
    await user.type(screen.getByPlaceholderText("Enter client name"), "CI Bot");
    await user.type(screen.getByPlaceholderText("Enter audience URL"), "https://aud.example.com");
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(saveServiceClient).toHaveBeenCalledTimes(1));
    expect(saveServiceClient.mock.calls[0][0]).toEqual({
      name: "CI Bot",
      roles: ["admin"],
      projectKey: "tenant-abc",
    });
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "Service Created successfully" });
  });

  it("shows an error toast when the save is unsuccessful", async () => {
    saveServiceClient.mockResolvedValue({ isSuccess: false, error: "nope" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CreateClientCredential />);
    await open(user);
    await user.type(screen.getByPlaceholderText("Enter client name"), "CI Bot");
    await user.type(screen.getByPlaceholderText("Enter audience URL"), "https://aud.example.com");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "nope" }));
  });
});
