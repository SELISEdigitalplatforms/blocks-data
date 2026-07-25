import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
let storageData: unknown;
let isLoading = false;

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));
vi.mock("@/hooks/use-scoped-path", () => ({
  useStoragePath: () => "/console/storage",
}));
vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: () => "https://api.base",
}));
vi.mock("../../hooks/use-storage-configuration", () => ({
  useGetStorageConfigurations: () => ({ data: storageData, isLoading, isFetching: false }),
}));
vi.mock("../storage-configuration/save-storage-configuration/save-storage-configuration", () => ({
  SaveStorageConfiguration: () => <div data-testid="save-config" />,
}));
vi.mock("./components/storage-details-drawer/storage-details-drawer", () => ({
  StorageDetailsDrawer: (props: { open?: boolean; storage?: { name?: string } }) =>
    props.open ? <div data-testid="details-drawer">{props.storage?.name}</div> : null,
}));
vi.mock("./components/storage-filters-toolbar/storage-filters-toolbar", () => ({
  StorageFiltersToolbar: (props: { onChange: (key: string, value: string) => void; onReset: () => void; onAddConfiguration: () => void }) => (
    <div data-testid="filters">
      <button onClick={() => props.onChange("search", "azure")}>set-search</button>
      <button onClick={props.onReset}>reset</button>
      <button onClick={props.onAddConfiguration}>add</button>
    </div>
  ),
}));
vi.mock("./components/storage-card/storage-card", () => ({
  StorageCard: (props: { data: { title?: string; id: string }; onClick: (id: string) => void; onViewDetails: (id: string) => void; onDisconnect: (id: string) => void }) => (
    <div data-testid="card">
      <span>{props.data.title}</span>
      <button onClick={() => props.onClick(props.data.id)}>open-{props.data.id}</button>
      <button onClick={() => props.onViewDetails(props.data.id)}>details-{props.data.id}</button>
      <button onClick={() => props.onDisconnect(props.data.id)}>disconnect-{props.data.id}</button>
    </div>
  ),
}));

import { Storage } from "./storage";

const configs = [
  { itemId: "1", name: "Alpha", storageStrategy: "Amazon" },
  { itemId: "2", name: "Default", storageStrategy: "Azure" },
  { itemId: "3", name: "Beta", storageStrategy: "S3Compatible" },
];

beforeEach(() => {
  vi.clearAllMocks();
  storageData = configs;
  isLoading = false;
});

describe("Storage", () => {
  it("renders the heading and a card per configuration", () => {
    render(<Storage />);
    expect(screen.getByRole("heading", { name: "Storage" })).toBeInTheDocument();
    expect(screen.getAllByTestId("card")).toHaveLength(3);
  });

  it("opens the swagger docs in a new tab", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<Storage />);
    fireEvent.click(screen.getByRole("button", { name: "API Docs" }));
    expect(openSpy).toHaveBeenCalledWith(
      "https://api.base/swagger/index.html",
      "_blank",
    );
    openSpy.mockRestore();
  });

  it("shows skeletons while loading", () => {
    isLoading = true;
    const { container } = render(<Storage />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("navigates on card click", () => {
    render(<Storage />);
    fireEvent.click(screen.getByText("open-1"));
    expect(navigate).toHaveBeenCalledWith("/console/storage?id=1");
  });

  it("opens the details drawer", () => {
    render(<Storage />);
    fireEvent.click(screen.getByText("details-3"));
    expect(screen.getByTestId("details-drawer")).toHaveTextContent("Beta");
  });

  it("filters by search and resets", () => {
    render(<Storage />);
    fireEvent.click(screen.getByText("set-search"));
    expect(screen.getAllByTestId("card")).toHaveLength(1);
    fireEvent.click(screen.getByText("reset"));
    expect(screen.getAllByTestId("card")).toHaveLength(3);
  });

  it("shows the empty state with no configurations", () => {
    storageData = [];
    render(<Storage />);
    expect(screen.getByText("No storage configurations found.")).toBeInTheDocument();
  });

  it("opens the add-configuration dialog", () => {
    render(<Storage />);
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("save-config")).toBeInTheDocument();
  });

  it("invokes the disconnect handler", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Storage />);
    fireEvent.click(screen.getByText("disconnect-1"));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
