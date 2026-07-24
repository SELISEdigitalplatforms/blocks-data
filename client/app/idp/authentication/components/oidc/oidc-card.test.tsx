import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOidcConfig } from "@blocks-idp/authentication/models/auth.oidc.model";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const deleteOidc = vi.fn();
let isErr = false;
let isPending = false;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/authentication/hooks/use-auth-oidc", () => ({
  useDeleteAuthOidc: () => ({ mutateAsync: deleteOidc, isPending }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("../create-oidc/create-oidc", () => ({
  CreateOIDC: ({ itemId }: { itemId: string }) => (
    <div data-testid="create-oidc">{itemId}</div>
  ),
}));
vi.mock("@/components/confirmation-modal/confirmation-modal", () => ({
  default: ({
    onCancel,
    onConfirm,
    buttonState,
  }: {
    onCancel: () => void;
    onConfirm: () => void;
    buttonState?: { confirm?: { disable?: boolean } };
  }) => (
    <div>
      <button onClick={onCancel}>modal-cancel</button>
      <button onClick={onConfirm} disabled={buttonState?.confirm?.disable}>
        modal-confirm
      </button>
    </div>
  ),
}));

import { OIDCCard } from "./oidc-card";

const oidc = (over: Partial<IOidcConfig> = {}): IOidcConfig =>
  ({
    itemId: "client-1",
    createdDate: "2024-01-02T10:30:00Z",
    clientSecret: "secret-value",
    redirectUri: "https://app/callback",
    scope: "openid profile",
    audience: "aud-1",
    clientDisplayName: "My OIDC",
    clientLogoUrl: "",
    clientBrandColor: "",
    ...over,
  }) as IOidcConfig;

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  isPending = false;
  deleteOidc.mockResolvedValue({ isSuccess: true });
});

describe("OIDCCard", () => {
  it("renders the display name and core labels", () => {
    render(<OIDCCard oidc={oidc()} />);
    expect(screen.getByText("My OIDC")).toBeInTheDocument();
    expect(screen.getByText("Client Id")).toBeInTheDocument();
    expect(screen.getByText("Client Secret")).toBeInTheDocument();
    expect(screen.getByText("Redirect URL")).toBeInTheDocument();
    expect(screen.getByText("Well Known URL")).toBeInTheDocument();
  });

  it("renders the scope badge and formatted created date", () => {
    const createdDate = "2024-01-02T10:30:00Z";
    render(<OIDCCard oidc={oidc({ scope: "openid", createdDate })} />);
    expect(screen.getByText("openid")).toBeInTheDocument();
    // Derive the expected string via the same formatter the component uses so
    // the assertion holds regardless of the runner's local timezone.
    const expected = format(new Date(createdDate), "dd/MM/yyyy HH:mm");
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows N/A for an empty scope and brand color", () => {
    render(<OIDCCard oidc={oidc({ scope: "", clientBrandColor: "" })} />);
    const nas = screen.getAllByText("N/A");
    expect(nas.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the logo and brand color swatch when provided", () => {
    render(
      <OIDCCard
        oidc={oidc({ clientLogoUrl: "https://logo.png", clientBrandColor: "#ff0000" })}
      />,
    );
    expect(screen.getByAltText("OIDC Logo")).toBeInTheDocument();
    expect(screen.getByText("#ff0000")).toBeInTheDocument();
  });

  it("deletes successfully through the confirmation modal", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<OIDCCard oidc={oidc()} />);
    // Open the delete dialog via the trash button (last ghost button in header).
    const trash = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-trash"));
    await user.click(trash as Element);
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() =>
      expect(deleteOidc).toHaveBeenCalledWith({
        itemId: "client-1",
        projectKey: "tenant-abc",
      }),
    );
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "OIDC credential deleted successfully",
    });
  });

  it("shows an error toast when the delete responds unsuccessful", async () => {
    deleteOidc.mockResolvedValue({ isSuccess: false, error: "nope" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<OIDCCard oidc={oidc()} />);
    const trash = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-trash"));
    await user.click(trash as Element);
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "nope" }));
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("maps a thrown error with an errors field", async () => {
    isErr = true;
    deleteOidc.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<OIDCCard oidc={oidc()} />);
    const trash = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-trash"));
    await user.click(trash as Element);
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });

  it("falls back to a generic error when the thrown error has no errors field", async () => {
    isErr = false;
    deleteOidc.mockRejectedValue(new Error("network"));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<OIDCCard oidc={oidc()} />);
    const trash = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-trash"));
    await user.click(trash as Element);
    await user.click(await screen.findByText("modal-confirm"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
  });
});
