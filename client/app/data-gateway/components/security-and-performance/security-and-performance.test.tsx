import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const useSecurityAndPerformanceSchemaList = vi.fn();
const useCreateSchema = vi.fn(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useSecurityAndPerformanceSchemaList: (...a: unknown[]) =>
    useSecurityAndPerformanceSchemaList(...a),
  useCreateSchema: (...a: unknown[]) => useCreateSchema(...a),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-notification-listener", () => ({
  useNotificationListener: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("../add-edit-schema", () => ({
  AddEditSchemaModal: () => <div data-testid="add-schema-modal" />,
}));

import SecurityAndPerformance from "./security-and-performance";

function renderPanel(props = {}) {
  const Wrapper = createWrapper();
  const handlers = {
    onSchemaRowClick: vi.fn(),
    onNavigateToSchemas: vi.fn(),
    onSchemaCreated: vi.fn(),
    ...props,
  };
  render(
    <Wrapper>
      <SecurityAndPerformance {...handlers} />
    </Wrapper>,
  );
  return handlers;
}

const listData = {
  data: {
    schemas: {
      items: [
        {
          schemaName: "User",
          readAccessLevel: 0,
          writeAccessLevel: 1,
          editAccessLevel: 2,
          deleteAccessLevel: 3,
        },
      ],
      totalCount: 1,
    },
    aggregation: {
      totalPublicPermission: 7,
      totalUserPermission: 11,
      totalCustomPermission: 13,
    },
  },
};

describe("SecurityAndPerformance", () => {
  beforeEach(() => {
    useSecurityAndPerformanceSchemaList.mockReset();
    useCreateSchema.mockReturnValue({ mutateAsync: vi.fn() });
  });

  it("shows the loading skeleton while fetching (no content yet)", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    renderPanel();
    expect(screen.queryByText("No schemas yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Security Assessment")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no schemas", async () => {
    const user = userEvent.setup();
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: { data: { schemas: { items: [], totalCount: 0 }, aggregation: {} } },
      isLoading: false,
    });
    const { onNavigateToSchemas } = renderPanel();

    expect(screen.getByText("No schemas yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Go to Schemas/ }));
    expect(onNavigateToSchemas).toHaveBeenCalled();
  });

  it("renders the assessment, stat counts and schema rows when data is present", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: listData,
      isLoading: false,
    });
    renderPanel();

    expect(screen.getByText("Security Assessment")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  it("opens the add-schema modal from the header button", async () => {
    const user = userEvent.setup();
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: listData,
      isLoading: false,
    });
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Add Schema/ }));
    expect(await screen.findByTestId("add-schema-modal")).toBeInTheDocument();
  });
});
