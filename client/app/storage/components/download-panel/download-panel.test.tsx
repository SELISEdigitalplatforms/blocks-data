import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZipDownloadRow } from "../../models/zip-download.model";
import { useZipDownloadStore } from "../../store/use-zip-download-store";
import { DownloadPanel } from "./download-panel";

const row = (over: Partial<ZipDownloadRow> = {}): ZipDownloadRow => ({
  id: crypto.randomUUID(),
  label: "Zipping 3 files",
  status: "preparing",
  controller: new AbortController(),
  ...over,
});

const seed = (rows: ZipDownloadRow[], collapsed = false) =>
  useZipDownloadStore.setState({ rows, collapsed });

describe("DownloadPanel", () => {
  afterEach(() => {
    useZipDownloadStore.setState({ rows: [], collapsed: false });
  });

  it("renders nothing without rows", () => {
    const { container } = render(<DownloadPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("header says 'Preparing download' for one preparing row and 'Preparing 2 downloads' for two", () => {
    seed([row()]);
    const { rerender } = render(<DownloadPanel />);
    expect(screen.getByText("Preparing download")).toBeInTheDocument();

    seed([row(), row({ label: "Zipping 2 items" })]);
    rerender(<DownloadPanel />);
    expect(screen.getByText("Preparing 2 downloads")).toBeInTheDocument();
  });

  it("header says 'Download started' when all started and 'Download failed' when all failed", () => {
    seed([row({ status: "started", zipName: "a.zip", totalBytes: 1024 })]);
    const { rerender } = render(<DownloadPanel />);
    expect(screen.getByText("Download started")).toBeInTheDocument();

    seed([row({ status: "failed", error: "Nope" })]);
    rerender(<DownloadPanel />);
    expect(screen.getByText("Download failed")).toBeInTheDocument();
  });

  it("started row shows the zip name as its primary text and the size beneath it", () => {
    seed([
      row({ status: "started", zipName: "Project-Docs.zip", totalBytes: 24 * 1024 * 1024 }),
    ]);
    render(<DownloadPanel />);

    const item = screen.getByRole("listitem");
    const [primary, secondary] = item.querySelectorAll("p");
    expect(primary).toHaveTextContent(/^Project-Docs\.zip$/);
    expect(primary).toHaveAttribute("title", "Project-Docs.zip");
    expect(secondary).toHaveTextContent(/^24\.0 MB$/);
    expect(secondary).toHaveAttribute("title", "24.0 MB");
    expect(screen.queryByText("Zipping 3 files")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Started")).toBeInTheDocument();
  });

  it("started 0-byte row shows no size line and no dangling separator", () => {
    seed([row({ status: "started", zipName: "Empty.zip", totalBytes: 0 })]);
    render(<DownloadPanel />);

    const item = screen.getByRole("listitem");
    expect(item.querySelectorAll("p")).toHaveLength(1);
    expect(item).toHaveTextContent(/^Empty\.zip$/);
    expect(item.textContent).not.toContain("·");
  });

  it("preparing row keeps the 'Zipping n files' label as its primary text", () => {
    seed([row({ label: "Zipping 3 files" })]);
    render(<DownloadPanel />);

    expect(screen.getByText("Zipping 3 files")).toHaveAttribute("title", "Zipping 3 files");
  });

  it("header text is announced politely", () => {
    seed([row()]);
    render(<DownloadPanel />);

    expect(screen.getByText("Preparing download")).toHaveAttribute("aria-live", "polite");
  });

  it("failed row shows its message under the name", () => {
    seed([
      row({
        label: "Zipping 12 files",
        status: "failed",
        error: "Too large to zip (max 2 GB / 5,000 files)",
      }),
    ]);
    render(<DownloadPanel />);
    expect(screen.getByText("Zipping 12 files")).toBeInTheDocument();
    expect(screen.getByText("Too large to zip (max 2 GB / 5,000 files)")).toBeInTheDocument();
  });

  it("collapse hides the rows but keeps the header", async () => {
    const user = userEvent.setup();
    seed([row()]);
    render(<DownloadPanel />);
    expect(screen.getByText("Zipping 3 files")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse" }));

    expect(screen.queryByText("Zipping 3 files")).not.toBeInTheDocument();
    expect(screen.getByText("Preparing download")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Zipping 3 files")).toBeInTheDocument();
  });

  it("close button calls store.close", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    seed([row()]);
    useZipDownloadStore.setState({ close });
    render(<DownloadPanel />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(close).toHaveBeenCalledTimes(1);
    useZipDownloadStore.setState({ close: useZipDownloadStore.getInitialState().close });
  });

  it("is a labelled region", () => {
    seed([row()]);
    render(<DownloadPanel />);
    expect(screen.getByRole("region", { name: "Downloads" })).toBeInTheDocument();
  });
});
