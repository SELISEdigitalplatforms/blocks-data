import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IClientCredentialsConfig } from "@blocks-idp/authentication/models/auth.oidc.model";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const deleteClient = vi.fn();
let isErr = false;
let isPending = false;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/authentication/hooks/use-auth-clients", () => ({
  useDeleteAuthClient: () => ({ mutateAsync: deleteClient, isPending }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@/components/confirmation-modal/confirmation-modal", () => ({
  default: ({ onConfirm }: { onConfirm: () => void }) => (
    <button onClick={onConfirm}>modal-confirm</button>
  ),
}));

import { ClientCredentialsCard } from "./client-credential-card";

const cred = (over: Partial<IClientCredentialsConfig> = {}): IClientCredentialsConfig =>
  ({
    itemId: "client-1",
    name: "My Client",
    clientSecret: "secret",
    createdDate: "2024-01-02T10:30:00Z",
    isActive: true,
    roles: ["admin"],
    audiences: ["aud-1"],
    ...over,
  }) as IClientCredentialsConfig;

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  isPending = false;
  deleteClient.mockResolvedValue({ isSuccess: true });
});

describe("ClientCredentialsCard", () => {
  it("renders the name, active badge, roles and audiences", () => {
    render(<ClientCredentialsCard clientCredential={cred()} />);
    expect(screen.getByText("My Client")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("aud-1")).toBeInTheDocument();
    expect(
      screen.getByText(format(new Date("2024-01-02T10:30:00Z"), "dd/MM/yyyy HH:mm")),
    ).toBeInTheDocument();
  });

  it("hides the active badge when inactive", () => {
    render(<ClientCredentialsCard clientCredential={cred({ isActive: false })} />);
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("shows N/A when there are no roles or audiences", () => {
    render(
      <ClientCredentialsCard
        clientCredential={cred({ roles: [], audiences: [] })}
      />,
    );
    expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(2);
  });

  it("deletes successfully through the confirmation modal", async () => {
    const user = userEvent.setup();
    render(<ClientCredentialsCard clientCredential={cred()} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() =>
      expect(deleteClient).toHaveBeenCalledWith({
        itemId: "client-1",
        projectKey: "tenant-abc",
      }),
    );
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "Client credential deleted successfully",
    });
  });

  it("shows an error toast when the delete responds unsuccessful", async () => {
    deleteClient.mockResolvedValue({ isSuccess: false, error: "nope" });
    const user = userEvent.setup();
    render(<ClientCredentialsCard clientCredential={cred()} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "nope" }));
  });

  it("maps a thrown error with an errors field", async () => {
    isErr = true;
    deleteClient.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    render(<ClientCredentialsCard clientCredential={cred()} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });

  it("falls back to a generic error otherwise", async () => {
    deleteClient.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<ClientCredentialsCard clientCredential={cred()} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
  });
});
