import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
let locationSearch = "";
let storageData: unknown;
let isLoading = false;
let isFetching = false;

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ search: locationSearch }),
}));
vi.mock("@/hooks/use-scoped-path", () => ({
  useStoragePath: () => "/console/storage",
}));
vi.mock("@/storage/hooks/use-storage-configuration", () => ({
  useGetStorageConfigurations: () => ({ data: storageData, isLoading, isFetching }),
}));
vi.mock("../storage-detail/storage-detail", () => ({
  StorageDetail: () => <div data-testid="storage-detail" />,
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
  StorageCard: (props: { data: { title?: string; id: string }; onClick: (id: string) => void; onViewDetails: (id: string) => void; onRemove: (id: string) => void }) => (
    <div data-testid="card">
      <span>{props.data.title}</span>
      <button onClick={() => props.onClick(props.data.id)}>open-{props.data.id}</button>
      <button onClick={() => props.onViewDetails(props.data.id)}>details-{props.data.id}</button>
      <button onClick={() => props.onRemove(props.data.id)}>remove-{props.data.id}</button>
    </div>
  ),
}));

import { StorageContents, StorageContentsWrapper } from "./storage-contents";

const configs = [
  { itemId: "1", name: "Alpha", storageStrategy: "Amazon" },
  { itemId: "2", name: "Default", storageStrategy: "Azure" },
  { itemId: "3", name: "Beta", storageStrategy: "S3Compatible" },
  { itemId: "4", name: "Gamma", storageStrategy: "Sftp" },
];

beforeEach(() => {
  vi.clearAllMocks();
  locationSearch = "";
  storageData = configs;
  isLoading = false;
  isFetching = false;
});

describe("StorageContentsWrapper", () => {
  it("renders the detail view when an id query param is present", () => {
    locationSearch = "?id=abc";
    render(<StorageContentsWrapper />);
    expect(screen.getByTestId("storage-detail")).toBeInTheDocument();
  });

  it("renders the list view when no id is present", () => {
    locationSearch = "";
    render(<StorageContentsWrapper />);
    expect(screen.getByTestId("filters")).toBeInTheDocument();
  });
});

describe("StorageContents", () => {
  it("shows skeletons while loading", () => {
    isLoading = true;
    const { container } = render(<StorageContents />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders a card per configuration with Default hoisted first", () => {
    render(<StorageContents />);
    const cards = screen.getAllByTestId("card");
    expect(cards).toHaveLength(4);
    // Default should be moved to the front (subtitle mapping keeps title=name).
    expect(cards[0]).toHaveTextContent("Default");
  });

  it("navigates on card click", () => {
    render(<StorageContents />);
    fireEvent.click(screen.getByText("open-1"));
    expect(navigate).toHaveBeenCalledWith("/console/storage?id=1");
  });

  it("opens the details drawer for a configuration", () => {
    render(<StorageContents />);
    fireEvent.click(screen.getByText("details-3"));
    expect(screen.getByTestId("details-drawer")).toHaveTextContent("Beta");
  });

  it("filters configurations by search", () => {
    render(<StorageContents />);
    fireEvent.click(screen.getByText("set-search"));
    // Only the Azure ("Default") configuration matches "azure".
    const cards = screen.getAllByTestId("card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Default");
  });

  it("resets filters back to all configurations", () => {
    render(<StorageContents />);
    fireEvent.click(screen.getByText("set-search"));
    expect(screen.getAllByTestId("card")).toHaveLength(1);
    fireEvent.click(screen.getByText("reset"));
    expect(screen.getAllByTestId("card")).toHaveLength(4);
  });

  it("shows the empty state when no configurations exist", () => {
    storageData = [];
    render(<StorageContents />);
    expect(screen.getByText("No storage configurations found.")).toBeInTheDocument();
  });

  it("opens the add-configuration dialog", () => {
    render(<StorageContents />);
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("save-config")).toBeInTheDocument();
  });

  it("handles non-array data defensively", () => {
    storageData = null;
    render(<StorageContents />);
    expect(screen.getByText("No storage configurations found.")).toBeInTheDocument();
  });

  it("calls the remove handler (console error) without throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<StorageContents />);
    fireEvent.click(screen.getByText("remove-1"));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
