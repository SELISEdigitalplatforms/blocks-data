import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IStorageConfiguration } from "@/storage/models/storage.model";

// The list pulls in child components that construct HttpClient (via blocks-kit)
// at import time; mock blocks-kit defensively per project conventions.
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({
    selectedProject: { itemId: "p1", tenantId: "t1", tenantSlug: "slug1", name: "Proj" },
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

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
  showSuccessToast: vi.fn(),
  showInfoToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

// Isolate the list from its heavy sibling modals.
vi.mock("../delete-storage-configuration/delete-storage-configuration", () => ({
  DeleteStorageConfiguration: ({ configuration }: { configuration: IStorageConfiguration }) => (
    <button data-testid={`delete-${configuration.itemId}`}>DeleteStub</button>
  ),
}));

vi.mock("../save-storage-configuration/save-storage-configuration", () => ({
  SaveStorageConfiguration: ({ configuration }: { configuration: IStorageConfiguration }) => (
    <div data-testid={`save-${configuration.itemId}`}>SaveStub {configuration.name}</div>
  ),
}));

import { StorageConfigurationList } from "./storage-configuration-list";

let idCounter = 0;
function makeConfig(overrides: Partial<IStorageConfiguration> = {}): IStorageConfiguration {
  idCounter += 1;
  return {
    storageStrategy: "Amazon",
    accessKey: null,
    cloudStorageRegionEndPoint: null,
    connectionString: null,
    createdBy: "u1",
    createdDate: "2024-01-01",
    itemId: `cfg-${idCounter}`,
    lastUpdatedBy: "u1",
    lastUpdatedDate: "2024-01-02",
    name: "Config One",
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

describe("StorageConfigurationList", () => {
  it("shows skeleton placeholders while loading", () => {
    const { container } = render(
      <StorageConfigurationList configurations={[]} isLoading={true} />,
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    // No config content while loading.
    expect(screen.queryByText(/AWS/)).not.toBeInTheDocument();
  });

  it("renders an empty accordion with no pagination when there are no configurations", () => {
    const { container } = render(
      <StorageConfigurationList configurations={[]} isLoading={false} />,
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an accordion trigger for each configuration strategy", () => {
    render(
      <StorageConfigurationList
        configurations={[
          makeConfig({ storageStrategy: "Amazon", name: "Default" }),
          makeConfig({ storageStrategy: "Azure", name: "Default" }),
          makeConfig({ storageStrategy: "SftpStorage", name: "Default" }),
        ]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Amazon (AWS)")).toBeInTheDocument();
    expect(screen.getByText("Azure (Azure)")).toBeInTheDocument();
    expect(screen.getByText("SftpStorage (SFTP)")).toBeInTheDocument();
  });

  it("shows Amazon detail fields for the first (auto-expanded) item", () => {
    render(
      <StorageConfigurationList
        configurations={[
          makeConfig({
            storageStrategy: "Amazon",
            name: "My AWS",
            accessKey: "AKIA123",
            secretKey: "SECRET99",
            cloudStorageRegionEndPoint: "us-east-1",
          }),
        ]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Configuration name")).toBeInTheDocument();
    expect(screen.getByText("My AWS")).toBeInTheDocument();
    expect(screen.getByText("Access key")).toBeInTheDocument();
    expect(screen.getByText("AKIA123")).toBeInTheDocument();
    expect(screen.getByText("Region endpoint")).toBeInTheDocument();
    expect(screen.getByText("us-east-1")).toBeInTheDocument();
  });

  it("masks the Azure connection string", () => {
    render(
      <StorageConfigurationList
        configurations={[
          makeConfig({
            storageStrategy: "Azure",
            name: "My Azure",
            connectionString: "SuperSecretAzureConnString",
          }),
        ]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Connection string")).toBeInTheDocument();
    // The raw value must not be rendered in plain text.
    expect(screen.queryByText("SuperSecretAzureConnString")).not.toBeInTheDocument();
  });

  it("shows SFTP detail fields for the first item", () => {
    render(
      <StorageConfigurationList
        configurations={[
          makeConfig({
            storageStrategy: "SftpStorage",
            name: "My SFTP",
            host: "sftp.example.com",
            port: "22",
            userName: "sftpuser",
            password: "pw123",
            remoteBasePath: "/data",
          }),
        ]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Remote base path")).toBeInTheDocument();
    expect(screen.getByText("/data")).toBeInTheDocument();
    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.getByText("sftp.example.com")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("sftpuser")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
  });

  it("shows S3Compatible detail fields for the first item", () => {
    render(
      <StorageConfigurationList
        configurations={[
          makeConfig({
            storageStrategy: "S3Compatible",
            name: "My S3",
            accessKey: "S3KEY",
            secretKey: "S3SECRET",
            host: "https://minio.local",
          }),
        ]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("S3Compatible (AWS S3 Compatible)")).toBeInTheDocument();
    expect(screen.getByText("Host URL")).toBeInTheDocument();
    expect(screen.getByText("https://minio.local")).toBeInTheDocument();
    expect(screen.getByText("S3KEY")).toBeInTheDocument();
  });

  it("renders Edit and Delete controls for a non-Default configuration", () => {
    const config = makeConfig({ name: "Editable", storageStrategy: "Amazon" });
    render(<StorageConfigurationList configurations={[config]} isLoading={false} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByTestId(`delete-${config.itemId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`save-${config.itemId}`)).toBeInTheDocument();
  });

  it("hides Edit and Delete controls for the Default configuration", () => {
    const config = makeConfig({ name: "Default", storageStrategy: "Amazon" });
    render(<StorageConfigurationList configurations={[config]} isLoading={false} />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByTestId(`delete-${config.itemId}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`save-${config.itemId}`)).not.toBeInTheDocument();
  });

  it("opens the edit dialog without error when Edit is clicked", async () => {
    const user = userEvent.setup();
    const config = makeConfig({ name: "Editable", storageStrategy: "Amazon" });
    render(<StorageConfigurationList configurations={[config]} isLoading={false} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("paginates when there are more configurations than the page size", async () => {
    const user = userEvent.setup();
    const configs = Array.from({ length: 6 }, () =>
      makeConfig({ storageStrategy: "Amazon", name: "Default" }),
    );
    render(<StorageConfigurationList configurations={configs} isLoading={false} />);

    // First page shows 5 accordion triggers.
    expect(screen.getAllByRole("button", { name: "Amazon (AWS)" })).toHaveLength(5);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    // Icon-only pagination buttons carry no text: [first, prev, next, last].
    const navButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.querySelector("svg") && !btn.textContent?.trim());
    expect(navButtons).toHaveLength(4);

    await user.click(navButtons[2]); // next

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Amazon (AWS)" })).toHaveLength(1);
  });

  it("resets the page when the configuration list shrinks below the current page", async () => {
    const user = userEvent.setup();
    const configs = Array.from({ length: 6 }, () =>
      makeConfig({ storageStrategy: "Amazon", name: "Default" }),
    );
    const { rerender } = render(
      <StorageConfigurationList configurations={configs} isLoading={false} />,
    );

    const navButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.querySelector("svg") && !btn.textContent?.trim());
    await user.click(navButtons[2]); // go to page 2
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    // Shrink the list so the current page no longer exists.
    rerender(
      <StorageConfigurationList configurations={configs.slice(0, 3)} isLoading={false} />,
    );

    // Effect drops back to page 0; pagination is gone (3 <= pageSize).
    expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Amazon (AWS)" })).toHaveLength(3);
  });
});
