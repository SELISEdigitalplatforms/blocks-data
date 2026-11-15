import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";

const useSecurityAndPerformanceSchemaList = vi.fn();
const createSchema = vi.fn();
const useCreateSchema = vi.fn(() => ({ mutateAsync: createSchema }));

// The real use-configuration module builds its service's HttpClients at import.
vi.mock("@/lib/http-client", () => mockHttpClientFactory());

vi.mock("@/data-gateway/hooks/use-configuration", async (importOriginal) => ({
  // The real list refresh, so the tests see exactly which queries an import notification invalidates.
  refreshSchemaLists: (await importOriginal<typeof import("@/data-gateway/hooks/use-configuration")>())
    .refreshSchemaLists,
  useSecurityAndPerformanceSchemaList: (...a: unknown[]) =>
    useSecurityAndPerformanceSchemaList(...a),
  useCreateSchema: (...a: unknown[]) => useCreateSchema(...a),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let notifHandler: ((d: unknown) => void) | undefined;
vi.mock("@/hooks/use-notification-listener", () => ({
  useNotificationListener: (_e: string, h: (d: unknown) => void) => {
    notifHandler = h;
  },
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

let capturedOnSubmit: ((v: unknown) => Promise<boolean>) | undefined;
vi.mock("../add-edit-schema", () => ({
  AddEditSchemaModal: ({ onSubmit }: { onSubmit: (v: unknown) => Promise<boolean> }) => {
    capturedOnSubmit = onSubmit;
    return <div data-testid="add-schema-modal" />;
  },
}));

vi.mock("./pagination", () => ({
  default: ({
    onPageChange,
    onPageSizeChange,
  }: {
    onPageChange: (p: number) => void;
    onPageSizeChange: (v: string) => void;
  }) => (
    <>
      <button onClick={() => onPageChange(3)}>page-3</button>
      <button onClick={() => onPageSizeChange("50")}>size-50</button>
    </>
  ),
}));

import SecurityAndPerformance from "./security-and-performance";
import { resetHandledImportNotifications } from "../../utils/schema-import-notification";

// Cached lists of the current project ("t1") and of another one.
const projectListKeys = [
  ["schema-list", "", 1, 10, true, "CreatedDate", "t1", ""],
  ["schema-list", "user", 2, 10, true, "CreatedDate", "t1", "entity"],
  ["unadapted-change-logs", "t1"],
  ["security-performance-schema-list", "t1"],
];
const otherProjectKeys = [
  ["schema-list", "", 1, 10, true, "CreatedDate", "other", ""],
  ["security-performance-schema-list", "other"],
];

/** A query client seeded with both projects' lists, with invalidateQueries spied on. */
function seededQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const key of [...projectListKeys, ...otherProjectKeys]) client.setQueryData(key, {});
  const invalidateQueries = vi.spyOn(client, "invalidateQueries");
  const isInvalidated = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, invalidateQueries, isInvalidated };
}

function renderPanel(props = {}, Wrapper: (p: { children: ReactNode }) => ReactNode = createWrapper()) {
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
    createSchema.mockReset();
    useCreateSchema.mockReturnValue({ mutateAsync: createSchema });
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
    notifHandler = undefined;
    capturedOnSubmit = undefined;
    resetHandledImportNotifications();
  });

  it("shows the loading skeleton while fetching (no content yet)", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    renderPanel();
    expect(screen.queryByText("No schemas yet")).not.toBeInTheDocument();
    // Heading stays visible during load so the route is never a blank main.
    expect(screen.getByRole("heading", { name: "Security Assessment" })).toBeInTheDocument();
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

  it("renders the assessment, the exposure legend and the schema rows", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: listData,
      isLoading: false,
    });
    renderPanel();

    expect(screen.getByText("Security Assessment")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();

    // The three counters are a proportional bar with a legend now.
    expect(screen.getByText("Access surface")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
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

  it("adds a schema from the empty-state Add Schema button", async () => {
    const user = userEvent.setup();
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: { data: { schemas: { items: [], totalCount: 0 }, aggregation: {} } },
      isLoading: false,
    });
    renderPanel();
    await user.click(screen.getByRole("button", { name: /Add Schema/ }));
    expect(await screen.findByTestId("add-schema-modal")).toBeInTheDocument();
  });

  it("creates an entity schema and reports success on submit", async () => {
    createSchema.mockResolvedValue({ isSuccess: true, data: { itemId: "s9" } });
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const user = userEvent.setup();
    const { onSchemaCreated } = renderPanel();
    await user.click(screen.getByRole("button", { name: /Add Schema/ }));

    const ok = await capturedOnSubmit!({
      schemaName: "Order",
      schemaType: "Entity",
      entityName: "sb_Orders",
    });
    expect(ok).toBe(true);
    expect(createSchema).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: "Order", collectionName: "sb_Orders", schemaType: 1 }),
    );
    expect(onSchemaCreated).toHaveBeenCalledWith("s9");
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when schema creation fails", async () => {
    createSchema.mockResolvedValue({ isSuccess: false, errors: { schemaName: "taken" } });
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /Add Schema/ }));

    const ok = await capturedOnSubmit!({ schemaName: "X", schemaType: "DTO", entityName: "" });
    expect(ok).toBe(false);
    expect(showErrorToast).toHaveBeenCalledWith({ errors: { schemaName: "taken" } });
  });

  // The HTTP client throws on any non-2xx response, with the parsed body as `errors`.
  const httpError = (body: Record<string, unknown>) => Object.assign(new Error("HTTP 400"), { status: 400, errors: body });

  it("shows the server's message when creation is rejected with a 400", async () => {
    // H7
    createSchema.mockRejectedValue(
      httpError({ isSuccess: false, message: "Collection name 'sb_Orders' is already used by schema 'Order'", httpStatusCode: 400, data: null, errors: null }),
    );
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /Add Schema/ }));

    const ok = await capturedOnSubmit!({ schemaName: "Purchase", schemaType: "Entity", entityName: "sb_Orders" });
    expect(ok).toBe(false);
    expect(showErrorToast).toHaveBeenCalledWith({ errors: ["Collection name 'sb_Orders' is already used by schema 'Order'"] });
    expect(screen.getByTestId("add-schema-modal")).toBeInTheDocument();
  });

  it.each([
    ["a 400 without a message", httpError({ isSuccess: false, message: "", errors: null })],
    ["a network error", new TypeError("Failed to fetch")],
  ])("shows this page's fallback text for %s, without an unhandled rejection", async (_case, error) => {
    // C14
    createSchema.mockRejectedValue(error);
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /Add Schema/ }));

    await expect(capturedOnSubmit!({ schemaName: "X", schemaType: "Entity", entityName: "sb_X" })).resolves.toBe(false);
    expect(showErrorToast).toHaveBeenCalledWith({ errors: ["An unexpected error occurred. Please try again."] });
  });

  it("shows one toast with the reasons for a failed import notification", () => {
    // H8; C4: no list refresh
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const { Wrapper, invalidateQueries } = seededQueryClient();
    renderPanel({}, Wrapper);
    notifHandler?.({
      message: {
        denormalizedPayload: {
          IsSuccess: false,
          FileId: "x",
          CorrelationId: "shot-1",
          Errors: ["Document[0]: CollectionName 'sb_Orders' is already used by schema 'Order'."],
        },
      },
    });
    expect(showErrorToast).toHaveBeenCalledTimes(1);
    expect(showErrorToast).toHaveBeenCalledWith({
      title: "Schema import failed:",
      errors: ["Document[0]: CollectionName 'sb_Orders' is already used by schema 'Order'."],
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("changes page and page size through the pagination controls", async () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "page-3" }));
    await user.click(screen.getByRole("button", { name: "size-50" }));
    // A re-render with new paging params keeps the panel mounted.
    expect(screen.getByText("Security Assessment")).toBeInTheDocument();
  });

  it("refreshes the project's schema lists and change logs on a successful import notification (H6)", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const { Wrapper, invalidateQueries, isInvalidated } = seededQueryClient();
    renderPanel({}, Wrapper);
    notifHandler?.({
      message: { denormalizedPayload: JSON.stringify({ Message: { IsSuccess: true } }) },
    });

    // The schema lists and security list prove refreshSchemaLists ran (the unscoped call also covers the change logs).
    for (const key of projectListKeys) expect(isInvalidated(key)).toBe(true);
    // The existing unscoped change-log invalidation stays; other projects' lists are left alone.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["unadapted-change-logs"] });
    expect(isInvalidated(otherProjectKeys[0])).toBe(false);
    expect(isInvalidated(otherProjectKeys[1])).toBe(false);
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("ignores an import notification without a payload", () => {
    // C5: no toast and no list refresh
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const { Wrapper, invalidateQueries } = seededQueryClient();
    renderPanel({}, Wrapper);
    notifHandler?.({ message: {} });
    expect(showErrorToast).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("shows an error toast when the import notification payload is malformed", () => {
    // C5: the existing toast and no list refresh
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: listData, isLoading: false });
    const { Wrapper, invalidateQueries } = seededQueryClient();
    renderPanel({}, Wrapper);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    notifHandler?.({ message: { denormalizedPayload: "{not-json" } });
    expect(showErrorToast).toHaveBeenCalledWith({ errors: "Error processing import schema" });
    expect(invalidateQueries).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
  // ── Phase 7: exposure, filters and risk order ───────────────────────────

  const riskyList = {
    data: {
      schemas: {
        items: [
          // Signed-in read only — the product default.
          {
            schemaName: "Quiet",
            readAccessLevel: 1,
            writeAccessLevel: 3,
            editAccessLevel: 3,
            deleteAccessLevel: 3,
          },
          // Anyone can create.
          {
            schemaName: "Wide",
            readAccessLevel: 2,
            writeAccessLevel: 2,
            editAccessLevel: 3,
            deleteAccessLevel: 3,
            fields: [{ name: "Email", isPIIData: true }],
          },
          // Public read, nothing sensitive on it.
          {
            schemaName: "Readable",
            readAccessLevel: 2,
            writeAccessLevel: 3,
            editAccessLevel: 3,
            deleteAccessLevel: 3,
          },
        ],
        totalCount: 3,
      },
      aggregation: {
        totalPublicPermission: 3,
        totalUserPermission: 1,
        totalCustomPermission: 7,
      },
    },
  };

  /** Table rows only: the alert hints mention these names too. */
  const rowNames = () =>
    screen
      .getAllByRole("button", { name: /^Open / })
      .map((b) => b.getAttribute("aria-label") ?? "");

  it("puts the most exposed schema first by default", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: riskyList,
      isLoading: false,
    });
    renderPanel();

    const names = rowNames();
    expect(names[0]).toBe("Open Wide");
    expect(names[1]).toBe("Open Readable");
    expect(names[2]).toBe("Open Quiet");
  });

  it("counts the alerts over the fetched schemas", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: riskyList,
      isLoading: false,
    });
    renderPanel();

    expect(screen.getByRole("button", { name: /Filter by public write/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Filter by pii exposed publicly/ })).toHaveTextContent(
      "1",
    );
  });

  it("narrows the table to the schemas behind a chip", async () => {
    const user = userEvent.setup();
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: riskyList,
      isLoading: false,
    });
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Needs attention/ }));

    expect(rowNames()).toEqual(["Open Wide", "Open Readable"]);
  });

  it("filters the table when an alert tile is clicked", async () => {
    const user = userEvent.setup();
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: riskyList,
      isLoading: false,
    });
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Filter by public write/ }));
    expect(rowNames()).toEqual(["Open Wide", "Open Readable"]);
  });

  // Risk order is a client-side judgement; it has to be possible to turn off.
  it("returns to the served order when risk sorting is switched off", async () => {
    const user = userEvent.setup();
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: riskyList,
      isLoading: false,
    });
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Exposure, high to low/ }));
    expect(rowNames()[0]).toBe("Open Quiet");
  });

  // The chips and alerts can only see what was fetched.
  it("says so when more schemas exist than were fetched", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: {
        data: {
          ...riskyList.data,
          schemas: { ...riskyList.data.schemas, totalCount: 500 },
        },
      },
      isLoading: false,
    });
    renderPanel();

    expect(screen.getByText(/Showing the first 3 of 500 schemas/)).toBeInTheDocument();
  });
});
