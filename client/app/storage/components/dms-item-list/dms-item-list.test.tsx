import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DmsItem } from "../../models/dms.model";
import { DmsItemList } from "./dms-item-list";

const item = (over: Record<string, unknown> = {}) =>
  ({
    itemId: "file-1",
    name: "report.pdf",
    type: "file",
    sizeInBytes: 2048,
    inheritsParentAccess: true,
    isArchived: false,
    isActive: true,
    permissions: {
      canView: true,
      canDownload: false,
      canEdit: false,
      canDelete: false,
      canManage: false,
      canOwner: false,
    },
    ...over,
  }) as DmsItem;

describe("DmsItemList", () => {
  it("renders each item", () => {
    render(<DmsItemList items={[item(), item({ itemId: "f2", name: "notes.txt" })]} />);

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
  });

  it("shows skeletons while loading rather than an empty message", () => {
    // An empty message during the first load reads as "there is nothing here",
    // which is a different statement from "this has not arrived yet".
    render(<DmsItemList items={[]} isLoading />);

    expect(screen.getByTestId("dms-item-list-loading")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here.")).not.toBeInTheDocument();
  });

  it("shows the empty message once loading has finished", () => {
    render(<DmsItemList items={[]} />);

    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("uses a caller-supplied empty message", () => {
    render(<DmsItemList items={[]} emptyMessage="The trash is empty." />);

    expect(screen.getByText("The trash is empty.")).toBeInTheDocument();
  });

  it("labels a directory as such and formats a file size", () => {
    render(
      <DmsItemList
        items={[item({ itemId: "d1", name: "Reports", type: "directory" }), item()]}
      />,
    );

    expect(screen.getByText("Directory")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("opens an item when one can be opened", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DmsItemList items={[item()]} onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: /report\.pdf/ }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ itemId: "file-1" }));
  });

  it("renders names as plain text when there is nowhere to open them", () => {
    render(<DmsItemList items={[item()]} />);

    expect(screen.queryByRole("button", { name: /report\.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("offers load-more only while the server reports another page", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = render(<DmsItemList items={[item()]} onLoadMore={onLoadMore} />);

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    rerender(<DmsItemList items={[item()]} hasNextPage onLoadMore={onLoadMore} />);
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalled();
  });

  it("disables load-more while a page is in flight", () => {
    render(<DmsItemList items={[item()]} hasNextPage isFetchingNextPage />);

    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
  });

  it("renders caller-supplied actions per row", () => {
    render(
      <DmsItemList
        items={[item()]}
        renderActions={(row) => <button type="button">act-{row.itemId}</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "act-file-1" })).toBeInTheDocument();
  });
});
