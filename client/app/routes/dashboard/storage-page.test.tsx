import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/storage/pages/storage/storage-contents", () => ({
  StorageContentsWrapper: () => <div>storage-page-child</div>,
}));

import StoragePage from "./storage-page";

describe("dashboard/storage-page StoragePage", () => {
  it("renders its StorageContentsWrapper child", () => {
    render(<StoragePage />);
    expect(screen.getByText("storage-page-child")).toBeInTheDocument();
  });
});
