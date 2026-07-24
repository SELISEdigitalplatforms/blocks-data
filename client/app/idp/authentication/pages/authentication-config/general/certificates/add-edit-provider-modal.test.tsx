import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const savePublicCertificates = vi.fn();
const validateJwksUrl = vi.fn();
const uploadFileMutate = vi.fn();
const selectedProject = { tenantId: "tenant-1" };

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@blocks-idp/authentication/hooks/use-identifier", () => ({
  useSavePublicCertificates: () => ({ mutateAsync: savePublicCertificates }),
  useValidateJwksUrl: () => ({ mutateAsync: validateJwksUrl }),
}));
vi.mock("@/storage/hooks/use-storage-file", () => ({
  usePublicCertificateFile: () => ({ mutateAsync: uploadFileMutate }),
}));

import { AddEditProviderModal } from "./add-edit-provider-modal";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

beforeEach(() => {
  vi.clearAllMocks();
  savePublicCertificates.mockResolvedValue({ isSuccess: true });
  validateJwksUrl.mockResolvedValue({ isValid: true });
  uploadFileMutate.mockResolvedValue({ downloadUrl: "https://cdn/cert.pfx" });
});

async function open(user: ReturnType<typeof userEvent.setup>, name = "Add") {
  await user.click(screen.getByRole("button", { name }));
}

describe("AddEditProviderModal", () => {
  it("renders an Add trigger with no existing data", () => {
    render(<AddEditProviderModal />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders an Edit trigger and prefills fields from existing data", async () => {
    const user = userEvent.setup();
    render(
      <AddEditProviderModal
        existingData={
          {
            jwksUrl: "https://issuer/jwks",
            issuer: "iss-1",
            audiences: ["a", "b"],
            providerName: "Okta",
          } as never
        }
      />,
    );
    await open(user, "Edit");
    expect(await screen.findByText("Edit provider")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://issuer/jwks")).toBeInTheDocument();
    expect(screen.getByDisplayValue("iss-1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("a, b")).toBeInTheDocument();
  });

  it("requires a JWKS URL for a non-Others provider", async () => {
    const user = userEvent.setup();
    render(<AddEditProviderModal />);
    await open(user);
    // Make the form dirty so Save enables, then clear the URL.
    await user.type(screen.getByLabelText("Issuer (Optional)"), "iss");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("JWKS URL is required")).toBeInTheDocument();
    expect(savePublicCertificates).not.toHaveBeenCalled();
  });

  it("shows the validation error when the JWKS URL is invalid", async () => {
    const user = userEvent.setup();
    validateJwksUrl.mockResolvedValue({ isValid: false, error: "bad url" });
    render(<AddEditProviderModal />);
    await open(user);
    await user.type(screen.getByLabelText("URL"), "https://x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("bad url")).toBeInTheDocument();
  });

  it("saves a valid public-url certificate and shows success", async () => {
    const user = userEvent.setup();
    render(<AddEditProviderModal />);
    await open(user);
    await user.type(screen.getByLabelText("URL"), "https://issuer/jwks");
    await user.type(screen.getByLabelText("Audience (Optional)"), "aud1, aud2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(savePublicCertificates).toHaveBeenCalledWith(
        expect.objectContaining({
          projectKey: "tenant-1",
          jwksUrl: "https://issuer/jwks",
          audiences: ["aud1", "aud2"],
          providerName: "Keycloak",
        }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when saving fails", async () => {
    const user = userEvent.setup();
    savePublicCertificates.mockResolvedValue({ isSuccess: false, errors: "nope" });
    render(<AddEditProviderModal />);
    await open(user);
    await user.type(screen.getByLabelText("URL"), "https://issuer/jwks");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "nope" }));
  });

  it("toggles password visibility for the Others provider", async () => {
    const user = userEvent.setup();
    render(<AddEditProviderModal />);
    await open(user);
    await user.click(screen.getByText("Others"));
    const pwd = screen.getByLabelText("Password (Optional)") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    // The eye toggle is the button next to the password input.
    const toggle = pwd.parentElement!.querySelector("button") as HTMLButtonElement;
    await user.click(toggle);
    expect(pwd.type).toBe("text");
  });

  it("errors when Others + upload-file is chosen without a file", async () => {
    const user = userEvent.setup();
    render(<AddEditProviderModal />);
    await open(user);
    await user.click(screen.getByText("Others"));
    await user.click(screen.getByText("Upload file"));
    // Make the form dirty so Save is enabled.
    await user.type(screen.getByLabelText("Issuer (Optional)"), "iss");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: "Please upload a certificate file",
      }),
    );
  });

  it("resets the form when the dialog is closed", async () => {
    const user = userEvent.setup();
    render(<AddEditProviderModal />);
    await open(user);
    await user.type(screen.getByLabelText("URL"), "typed-value");
    // DialogClose wraps the Cancel Button, so two elements share the name.
    const cancels = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancels[cancels.length - 1]);
    // Reopen; URL should be back to empty.
    await open(user);
    const url = screen.getByLabelText("URL") as HTMLInputElement;
    expect(url.value).toBe("");
  });
});
