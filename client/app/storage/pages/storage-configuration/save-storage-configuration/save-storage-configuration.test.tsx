import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IStorageConfiguration } from "@/storage/models/storage.model";

const { mutateAsync, showErrorToast, showSuccessToast } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/storage/hooks/use-storage-configuration", () => ({
  useSaveStorageConfiguration: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
  showSuccessToast,
  showInfoToast: vi.fn(),
  showErrorToast,
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({
    selectedProject: {
      itemId: "p1",
      tenantId: "t1",
      tenantSlug: "slug1",
      name: "Proj",
    },
    setSelectedProject: vi.fn(),
  }),
  HttpClient: class {
    get() {}
    post() {}
    put() {}
    patch() {}
    delete() {}
    stream() {}
  },
}));

import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { SaveStorageConfiguration } from "./save-storage-configuration";

// Radix Select relies on pointer-capture / scrollIntoView APIs jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

function makeConfig(
  overrides: Partial<IStorageConfiguration> = {},
): IStorageConfiguration {
  return {
    storageStrategy: "Azure",
    accessKey: null,
    cloudStorageRegionEndPoint: null,
    connectionString: "conn-string",
    createdBy: "me",
    createdDate: "2024-01-01",
    itemId: "cfg-77",
    lastUpdatedBy: "me",
    lastUpdatedDate: "2024-01-02",
    name: "azure-store",
    organizationIds: [],
    secretKey: null,
    tags: [],
    host: null,
    port: null,
    userName: null,
    password: null,
    remoteBasePath: null,
    ...overrides,
  };
}

function renderForm(props: Partial<React.ComponentProps<typeof SaveStorageConfiguration>> = {}) {
  const onClose = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(
    <Dialog open onOpenChange={onOpenChange}>
      <SaveStorageConfiguration onClose={onClose} {...props} />
    </Dialog>,
  );
  return { onClose, onOpenChange, ...utils };
}

describe("SaveStorageConfiguration", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("renders the add form with the Amazon (default) provider fields", () => {
    renderForm();
    expect(screen.getByText("Add Storage Configuration")).toBeInTheDocument();
    expect(screen.getByText("Storage Provider")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter access key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter secret key")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter region endpoint"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows validation errors and does not save on empty submit", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Access key is required")).toBeInTheDocument();
    expect(screen.getByText("Secret key is required")).toBeInTheDocument();
    expect(screen.getByText("Region endpoint is required")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("submits a valid new Amazon configuration and shows a success toast", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await user.type(screen.getByPlaceholderText("Enter name"), "my-aws");
    await user.type(screen.getByPlaceholderText("Enter access key"), "AK123");
    await user.type(screen.getByPlaceholderText("Enter secret key"), "SK456");
    await user.type(
      screen.getByPlaceholderText("Enter region endpoint"),
      "us-east-1",
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "my-aws",
          // "Amazon" is remapped to "AWS" for the API.
          storageStrategy: "AWS",
          accessKey: "AK123",
          secretKey: "SK456",
          cloudStorageRegionEndPoint: "us-east-1",
          projectKey: "t1",
          updateRequest: false,
          itemId: null,
        }),
      ),
    );
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "New configuration added successfully",
      }),
    );
    expect(onClose).toHaveBeenCalledWith(false);
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("reveals the Azure connection-string field when the provider is switched", async () => {
    const user = userEvent.setup();
    renderForm();

    // Amazon is the default -> region endpoint visible, connection string not.
    expect(
      screen.getByPlaceholderText("Enter region endpoint"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Azure" }));

    expect(
      await screen.findByPlaceholderText("Enter connection string"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Enter region endpoint"),
    ).not.toBeInTheDocument();
  });

  it("prefills the form and disables the provider select in edit mode", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm({ configuration: makeConfig() });
    mutateAsync.mockResolvedValue({ isSuccess: true });

    expect(screen.getByText("Edit Storage Configuration")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter name")).toHaveValue("azure-store");
    expect(
      screen.getByPlaceholderText("Enter connection string"),
    ).toHaveValue("conn-string");
    expect(screen.getByRole("combobox")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "azure-store",
          storageStrategy: "Azure",
          connectionString: "conn-string",
          projectKey: "t1",
          updateRequest: true,
          itemId: "cfg-77",
        }),
      ),
    );
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Configuration updated successfully",
      }),
    );
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("renders SFTP-specific fields in edit mode for an SftpStorage configuration", () => {
    renderForm({
      configuration: makeConfig({
        storageStrategy: "SftpStorage",
        connectionString: null,
        host: "10.0.0.1",
        port: "22",
        userName: "root",
        password: "secret",
        remoteBasePath: "/data",
        name: "sftp-store",
      }),
    });

    expect(screen.getByPlaceholderText("Enter remote base path")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter host")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter port")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter password")).toBeInTheDocument();
  });

  it("renders S3-compatible-specific fields in edit mode", () => {
    renderForm({
      configuration: makeConfig({
        storageStrategy: "S3Compatible",
        connectionString: null,
        accessKey: "AK",
        secretKey: "SK",
        host: "https://minio.local",
        name: "s3c-store",
      }),
    });

    expect(screen.getByPlaceholderText("Enter access key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter secret key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter host URL")).toBeInTheDocument();
  });

  it("shows an error toast and does not close when the save is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "server-nope" });
    const user = userEvent.setup();
    const { onClose } = renderForm();

    await user.type(screen.getByPlaceholderText("Enter name"), "my-aws");
    await user.type(screen.getByPlaceholderText("Enter access key"), "AK");
    await user.type(screen.getByPlaceholderText("Enter secret key"), "SK");
    await user.type(
      screen.getByPlaceholderText("Enter region endpoint"),
      "eu-west-1",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "server-nope" }),
    );
    expect(showSuccessToast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("surfaces structured errors thrown by the mutation", async () => {
    mutateAsync.mockRejectedValue({ errors: { name: ["Taken"] } });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("Enter name"), "my-aws");
    await user.type(screen.getByPlaceholderText("Enter access key"), "AK");
    await user.type(screen.getByPlaceholderText("Enter secret key"), "SK");
    await user.type(
      screen.getByPlaceholderText("Enter region endpoint"),
      "eu-west-1",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: { name: ["Taken"] },
      }),
    );
  });

  it("falls back to a generic error message for unstructured throws", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("Enter name"), "my-aws");
    await user.type(screen.getByPlaceholderText("Enter access key"), "AK");
    await user.type(screen.getByPlaceholderText("Enter secret key"), "SK");
    await user.type(
      screen.getByPlaceholderText("Enter region endpoint"),
      "eu-west-1",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: "Something went wrong",
      }),
    );
  });

  it("closes the dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderForm();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
