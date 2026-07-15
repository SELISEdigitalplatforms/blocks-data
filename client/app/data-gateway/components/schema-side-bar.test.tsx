import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const useSchemaList = vi.fn();
const reloadMutateAsync = vi.fn();

vi.mock("../hooks/use-configuration", () => ({
  useSchemaList: (...a: unknown[]) => useSchemaList(...a),
  useSchemasReload: () => ({ mutateAsync: reloadMutateAsync, isPending: false }),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (v: unknown) => v }));
vi.mock("@/hooks/use-notification-listener", () => ({
  useNotificationListener: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

import SchemasSidebar from "./schema-side-bar";

function renderSidebar(props: Partial<Parameters<typeof SchemasSidebar>[0]> = {}) {
  const Wrapper = createWrapper();
  const onListQueryChange = vi.fn();
  const onAddSchema = vi.fn();
  render(
    <Wrapper>
      <SchemasSidebar
        onAddSchema={onAddSchema}
        filterType="all"
        page={1}
        pageSize={10}
        onListQueryChange={onListQueryChange}
        {...props}
      />
    </Wrapper>,
  );
  return { onListQueryChange, onAddSchema };
}

describe("SchemasSidebar", () => {
  beforeEach(() => {
    useSchemaList.mockReset();
    reloadMutateAsync.mockReset();
  });

  it("renders the skeleton before data resolves", () => {
    useSchemaList.mockReturnValue({ data: undefined });
    renderSidebar();
    expect(screen.getByText("Schemas")).toBeInTheDocument();
    expect(screen.queryByText("No schemas found")).not.toBeInTheDocument();
  });

  it("renders the empty message when the list is empty", () => {
    useSchemaList.mockReturnValue({ data: { data: { items: [], totalCount: 0 } } });
    renderSidebar();
    expect(screen.getByText("No schemas found")).toBeInTheDocument();
  });

  it("lists schemas and selects one on click", async () => {
    const user = userEvent.setup();
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [
            { id: "a", schemaName: "User", schemaType: 1, totalSchemaReferences: 0 },
            { id: "b", schemaName: "Order", schemaType: 2, totalSchemaReferences: 0 },
          ],
          totalCount: 2,
        },
      },
    });
    const { onListQueryChange } = renderSidebar();

    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Order")).toBeInTheDocument();

    await user.click(screen.getByText("User"));
    expect(onListQueryChange).toHaveBeenCalledWith({ schemaId: "a" });
  });

  it("changes the filter when a tab is clicked", async () => {
    const user = userEvent.setup();
    useSchemaList.mockReturnValue({ data: { data: { items: [], totalCount: 0 } } });
    const { onListQueryChange } = renderSidebar();

    await user.click(screen.getByRole("tab", { name: "Entity" }));
    expect(onListQueryChange).toHaveBeenCalledWith({ type: "1", page: 1 });
  });

  it("publishes schemas via the reload mutation", async () => {
    const user = userEvent.setup();
    reloadMutateAsync.mockResolvedValue({ isSuccess: true });
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [{ id: "a", schemaName: "User", schemaType: 1, totalSchemaReferences: 0 }],
          totalCount: 1,
        },
      },
    });
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /Publish/ }));
    await waitFor(() => expect(reloadMutateAsync).toHaveBeenCalled());
  });

  it("paginates to the next page when there are more items than fit a page", async () => {
    const user = userEvent.setup();
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [{ id: "a", schemaName: "User", schemaType: 1, totalSchemaReferences: 0 }],
          totalCount: 25,
        },
      },
    });
    const { onListQueryChange } = renderSidebar({ page: 1, pageSize: 10 });

    expect(screen.getByText("1–10 of 25")).toBeInTheDocument();
    // Next is the pager button carrying the chevron-right icon
    const nextBtn = document
      .querySelector("svg.lucide-chevron-right")!
      .closest("button")!;
    await user.click(nextBtn);
    expect(onListQueryChange).toHaveBeenCalledWith({ page: 2 });
  });
});
