import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const navigateMock = vi.fn();
const setQueryParams = vi.fn();
const useDataGatewaySearchParams = vi.fn();
const useGetUnadaptedChangeLogs = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../hooks/use-data-gateway-search-params", () => ({
  useDataGatewaySearchParams: () => useDataGatewaySearchParams(),
}));

vi.mock("../hooks/use-configuration", () => ({
  getPolicyDataQueryOptions: () => ({
    queryKey: ["p"],
    queryFn: () => Promise.resolve(null),
  }),
  useCreateSchema: () => ({ mutateAsync: vi.fn() }),
  useGetUnadaptedChangeLogs: () => useGetUnadaptedChangeLogs(),
  useSchemaDetails: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "http://x" }));

vi.mock("./schema-structure", () => ({
  default: () => <div data-testid="schema-structure" />,
}));
vi.mock("./security-and-performance/security-and-performance", () => ({
  default: () => <div data-testid="security-view" />,
}));
vi.mock("./schema-side-bar", () => ({
  default: () => <div data-testid="sidebar" />,
}));
vi.mock("./schema-basic-info", () => ({
  SchemaBasicInfo: () => <div data-testid="basic-info" />,
}));
vi.mock("./add-edit-schema", () => ({
  AddEditSchemaModal: () => <div data-testid="add-edit" />,
}));
vi.mock("./data-gateway-actions", () => ({
  DataGatewayActions: () => <div data-testid="actions" />,
}));

import { SchemaDetailsPage } from "./schema-details-page";

function renderPage() {
  const Wrapper = createWrapper();
  render(
    <Wrapper>
      <SchemaDetailsPage />
    </Wrapper>,
  );
}

describe("SchemaDetailsPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setQueryParams.mockReset();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [] } });
  });

  it("shows the security landing view when no type is in the URL", () => {
    useDataGatewaySearchParams.mockReturnValue([
      { type: null, schemaId: null, page: 1, pageSize: 10 },
      setQueryParams,
    ]);
    renderPage();

    expect(screen.getByTestId("security-view")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    // Plain breadcrumb text (not the two-part nav)
    expect(screen.getByText("Data Gateway")).toBeInTheDocument();
  });

  it("shows the two-panel schema view with a breadcrumb when a type is set", async () => {
    const user = userEvent.setup();
    useDataGatewaySearchParams.mockReturnValue([
      { type: "all", schemaId: null, page: 1, pageSize: 10 },
      setQueryParams,
    ]);
    renderPage();

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("security-view")).not.toBeInTheDocument();
    expect(screen.getByText("Schemas")).toBeInTheDocument();

    // Clicking the "Data Gateway" breadcrumb button returns to the security view
    await user.click(screen.getByRole("button", { name: "Data Gateway" }));
    expect(navigateMock).toHaveBeenCalledWith("/dg");
  });

  it("shows the unadapted-changes alert in schema view when changes exist", () => {
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "c1" }] } });
    useDataGatewaySearchParams.mockReturnValue([
      { type: "all", schemaId: "s1", page: 1, pageSize: 10 },
      setQueryParams,
    ]);
    renderPage();

    expect(
      screen.getByText(/You have unadapted changes/i),
    ).toBeInTheDocument();
  });
});
