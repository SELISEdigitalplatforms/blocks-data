import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilePreviewModal } from "./file-preview-modal";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  fileUrl: "https://files/x",
  fileName: "file",
  fileExtension: ".pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("FilePreviewModal", () => {
  it("shows a skeleton while loading", () => {
    render(<FilePreviewModal {...baseProps} isLoading />);
    expect(document.body.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows a fallback message when there is no file URL", () => {
    render(<FilePreviewModal {...baseProps} fileUrl={null} />);
    expect(screen.getByText("Unable to load file preview")).toBeInTheDocument();
  });

  it("renders a PDF iframe and marks it loaded on load", () => {
    render(<FilePreviewModal {...baseProps} fileExtension=".pdf" fileName="doc.pdf" />);
    const iframe = document.body.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    fireEvent.load(iframe);
    // After load the loading overlay skeleton is removed.
    expect(iframe).toHaveAttribute("title", "doc.pdf");
  });

  it("renders an image for image extensions", () => {
    render(<FilePreviewModal {...baseProps} fileExtension=".png" fileName="pic.png" />);
    const img = document.body.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "https://files/x");
  });

  it("renders a video player for video extensions", () => {
    render(<FilePreviewModal {...baseProps} fileExtension=".mp4" />);
    expect(document.body.querySelector("video")).toBeInTheDocument();
  });

  it("renders an audio player for audio extensions", () => {
    render(<FilePreviewModal {...baseProps} fileExtension=".mp3" />);
    expect(document.body.querySelector("audio")).toBeInTheDocument();
  });

  it("fetches and displays text content for text extensions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ text: () => Promise.resolve("hello world") }),
    );
    render(<FilePreviewModal {...baseProps} fileExtension=".txt" />);
    expect(await screen.findByText("hello world")).toBeInTheDocument();
  });

  it("shows an error message when text fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<FilePreviewModal {...baseProps} fileExtension=".json" />);
    expect(await screen.findByText("Error loading file content")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("offers a download link for unsupported types", () => {
    render(<FilePreviewModal {...baseProps} fileExtension=".xyz" fileName="thing.xyz" />);
    const link = screen.getByRole("link", { name: "Download File" });
    expect(link).toHaveAttribute("href", "https://files/x");
    expect(link).toHaveAttribute("download", "thing.xyz");
  });
});
