import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { IStorageConfiguration } from "@/storage/models/storage.model";
import { StorageDetailsDrawer } from "./storage-details-drawer";

function makeStorage(overrides: Partial<IStorageConfiguration> = {}): IStorageConfiguration {
  return {
    name: "My Bucket",
    storageStrategy: "Amazon",
    createdBy: "",
    lastUpdatedDate: "2024-01-02T10:00:00.000Z",
    createdDate: "2024-01-01T10:00:00.000Z",
    ...overrides,
  } as IStorageConfiguration;
}

describe("StorageDetailsDrawer", () => {
  it("renders nothing when storage is null", () => {
    const { container } = render(
      <StorageDetailsDrawer open onOpenChange={vi.fn()} storage={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the configuration name and provider label for Amazon", () => {
    render(
      <StorageDetailsDrawer open onOpenChange={vi.fn()} storage={makeStorage()} />,
    );
    expect(screen.getByText("My Bucket")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });

  it("maps SftpStorage to the SFTP label", () => {
    render(
      <StorageDetailsDrawer
        open
        onOpenChange={vi.fn()}
        storage={makeStorage({ storageStrategy: "SftpStorage" })}
      />,
    );
    expect(screen.getByText("SFTP")).toBeInTheDocument();
  });

  it("maps S3Compatible to the AWS S3 Compatible label", () => {
    render(
      <StorageDetailsDrawer
        open
        onOpenChange={vi.fn()}
        storage={makeStorage({ storageStrategy: "S3Compatible" })}
      />,
    );
    expect(screen.getByText("AWS S3 Compatible")).toBeInTheDocument();
  });

  it("falls back to 'Me' when there is no creator", () => {
    render(
      <StorageDetailsDrawer open onOpenChange={vi.fn()} storage={makeStorage({ createdBy: "" })} />,
    );
    expect(screen.getByText("Me")).toBeInTheDocument();
  });

  it("shows the creator name when present", () => {
    render(
      <StorageDetailsDrawer
        open
        onOpenChange={vi.fn()}
        storage={makeStorage({ createdBy: "alice" })}
      />,
    );
    expect(screen.getByText("alice")).toBeInTheDocument();
  });
});
