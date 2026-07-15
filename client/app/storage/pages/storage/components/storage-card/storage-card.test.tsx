import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageCard, StorageCardData } from "./storage-card";

function makeData(overrides: Partial<StorageCardData> = {}): StorageCardData {
  return {
    id: "cfg-1",
    provider: "Amazon",
    providerIcon: "aws",
    providerColor: "orange",
    title: "My AWS",
    subtitle: "Amazon S3 Bucket",
    ...overrides,
  };
}

describe("StorageCard", () => {
  it("renders the subtitle", () => {
    render(<StorageCard data={makeData()} />);
    expect(screen.getByText("Amazon S3 Bucket")).toBeInTheDocument();
  });

  it("shows the AWS icon for an Amazon provider", () => {
    render(<StorageCard data={makeData({ provider: "Amazon" })} />);
    expect(screen.getByAltText("AWS")).toBeInTheDocument();
  });

  it("shows the Azure icon for an Azure provider", () => {
    render(<StorageCard data={makeData({ provider: "Azure" })} />);
    expect(screen.getByAltText("Azure")).toBeInTheDocument();
  });

  it("calls onClick with the id when the card is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StorageCard data={makeData()} onClick={onClick} />);
    await user.click(screen.getByText("Amazon S3 Bucket"));
    expect(onClick).toHaveBeenCalledWith("cfg-1");
  });

  it("calls onViewDetails from the dropdown menu", async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    render(<StorageCard data={makeData()} onViewDetails={onViewDetails} />);
    // open the menu (the trigger is the only button rendered directly)
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("View Details"));
    expect(onViewDetails).toHaveBeenCalledWith("cfg-1");
  });
});
