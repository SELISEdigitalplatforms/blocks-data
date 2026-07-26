import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveOidc = vi.fn();
const getPreSign = vi.fn();
const uploadFile = vi.fn();
const getFileByFileId = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
let existingOidc: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: false };

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@blocks-idp/authentication/hooks/use-auth-oidc", () => ({
  useSaveAuthOidc: () => ({ mutateAsync: saveOidc, isPending: false }),
  useGetAuthOidcCredential: () => existingOidc,
}));
vi.mock("@/storage/hooks/use-storage-file", () => ({
  useGetPreSignedUrlForUpload: () => ({ mutateAsync: getPreSign }),
  useUploadFile: () => ({ mutateAsync: uploadFile }),
}));
vi.mock("@/storage/services/storage.service", () => ({
  storageService: { file: { getFileByFileId: (...a: unknown[]) => getFileByFileId(...a) } },
}));
vi.mock("@/lib/error", () => ({
  isErrorWithErrors: (e: unknown) => !!(e as { errors?: unknown })?.errors,
}));
vi.mock("@/components/color-swatch/color-swatch", () => ({
  ColorSwatch: ({ value }: { value: string }) => <div data-testid="color-swatch">{value}</div>,
}));

import { CreateOIDC } from "./create-oidc";

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /Create/ }));
};

const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText("Enter client name"), "My Client");
  await user.type(screen.getByPlaceholderText("https://example.com/oidc"), "https://rp.example.com/cb");
  await user.type(screen.getByPlaceholderText("https://example.com"), "https://aud.example.com");
};

beforeEach(() => {
  vi.clearAllMocks();
  existingOidc = { data: undefined, isLoading: false };
  saveOidc.mockResolvedValue({ isSuccess: true });
});

describe("CreateOIDC", () => {
  it("opens the create dialog with empty defaults", async () => {
    const user = userEvent.setup();
    render(<CreateOIDC />);
    await openDialog(user);
    expect(await screen.findByText("New OIDC Client")).toBeInTheDocument();
    expect(screen.getByText("Enter details to create a new key")).toBeInTheDocument();
  });

  it("rejects an invalid image file type", async () => {
    const user = userEvent.setup();
    render(<CreateOIDC />);
    await openDialog(user);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] } });
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    expect(getPreSign).not.toHaveBeenCalled();
  });

  it("uploads a valid logo through the pre-signed url flow", async () => {
    getPreSign.mockResolvedValue({ isSuccess: true, uploadUrl: "https://upload", fileId: "file-1" });
    uploadFile.mockResolvedValue(undefined);
    getFileByFileId.mockResolvedValue({ url: "https://cdn/logo.png" });
    const user = userEvent.setup();
    render(<CreateOIDC />);
    await openDialog(user);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["img"], "logo.png", { type: "image/png" })] } });
    await waitFor(() => expect(getPreSign).toHaveBeenCalled());
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("submits a new OIDC client and closes on success", async () => {
    const user = userEvent.setup();
    render(<CreateOIDC />);
    await openDialog(user);
    await fillValid(user);
    const addBtn = screen.getByRole("button", { name: "Add" });
    await waitFor(() => expect(addBtn).toBeEnabled());
    await user.click(addBtn);
    await waitFor(() =>
      expect(saveOidc).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: "https://aud.example.com",
          redirectUri: "https://rp.example.com/cb",
          projectKey: "tenant-1",
          clientDisplayName: "My Client",
        }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("surfaces an error toast when saving fails", async () => {
    saveOidc.mockResolvedValue({ isSuccess: false, error: "duplicate" });
    const user = userEvent.setup();
    render(<CreateOIDC />);
    await openDialog(user);
    await fillValid(user);
    const addBtn = screen.getByRole("button", { name: "Add" });
    await waitFor(() => expect(addBtn).toBeEnabled());
    await user.click(addBtn);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("prefills the form in edit mode from the existing credential", async () => {
    existingOidc = {
      data: {
        oIDCClientCredential: {
          redirectUri: "https://edit.example.com/cb",
          audience: "https://edit-aud.example.com",
          scope: "openid",
          clientBrandColor: "#abcdef",
          clientDisplayName: "Existing Client",
          clientLogoUrl: "",
        },
      },
      isLoading: false,
    };
    const user = userEvent.setup();
    render(<CreateOIDC itemId="client-1" />);
    // Edit trigger is the pencil button.
    await user.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByText("Edit OIDC Client")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Existing Client")).toBeInTheDocument();
  });
});
