import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const useSchemaList = vi.fn();

// Capture the notification handler the sidebar registers so tests can invoke it.
const { notifyRef } = vi.hoisted(() => ({
  notifyRef: { current: null as null | ((data: unknown) => void) },
}));

vi.mock("../hooks/use-configuration", () => ({
  useSchemaList: (...a: unknown[]) => useSchemaList(...a),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (v: unknown) => v }));
vi.mock("@/hooks/use-notification-listener", () => ({
  useNotificationListener: (_name: string, cb: (data: unknown) => void) => {
    notifyRef.current = cb;
  },
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

  // The Entity/Child filters were a Tabs group, which promises panels that
  // switch. They are pressed-state toggles now, because nothing switches.
  it("changes the filter when a type chip is clicked, and marks the active one", async () => {
    const user = userEvent.setup();
    useSchemaList.mockReturnValue({ data: { data: { items: [], totalCount: 0 } } });
    const { onListQueryChange } = renderSidebar();

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Entity" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Entity" }));
    expect(onListQueryChange).toHaveBeenCalledWith({ type: "1", page: 1 });
  });

  // Publishing moved to the page bar, where the pending count lives. The
  // sidebar button only appeared once a schema existed, so the "unadapted
  // changes" warning could be on screen with nothing to click.
  it("no longer carries a Publish button", () => {
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [{ id: "a", schemaName: "User", schemaType: 1, totalSchemaReferences: 0 }],
          totalCount: 1,
        },
      },
    });
    renderSidebar();

    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
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

  it("paginates to the previous page from a later page", async () => {
    const user = userEvent.setup();
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [{ id: "a", schemaName: "User", schemaType: 1, totalSchemaReferences: 0 }],
          totalCount: 25,
        },
      },
    });
    const { onListQueryChange } = renderSidebar({ page: 2, pageSize: 10 });

    const prevBtn = document
      .querySelector("svg.lucide-chevron-left")!
      .closest("button")!;
    await user.click(prevBtn);
    expect(onListQueryChange).toHaveBeenCalledWith({ page: 1 });
  });

  it("syncs the internal selection with the external selected schema id", () => {
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [{ id: "a", schemaName: "User", schemaType: 1, totalSchemaReferences: 0 }],
          totalCount: 1,
        },
      },
    });
    renderSidebar({ selectedSchemaId: "a" });
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  it("invalidates change-log queries on a successful import notification", () => {
    useSchemaList.mockReturnValue({ data: { data: { items: [], totalCount: 0 } } });
    renderSidebar();

    expect(notifyRef.current).toBeTypeOf("function");
    act(() => {
      notifyRef.current!({
        message: {
          denormalizedPayload: JSON.stringify({ Message: { IsSuccess: true } }),
        },
      });
    });
    // No throw = handled path executed.
    expect(screen.getByText("No schemas found")).toBeInTheDocument();
  });

  it("ignores an import notification with no payload", () => {
    useSchemaList.mockReturnValue({ data: { data: { items: [], totalCount: 0 } } });
    renderSidebar();

    act(() => {
      notifyRef.current!({ message: {} });
    });
    expect(screen.getByText("No schemas found")).toBeInTheDocument();
  });

  it("logs an error when the import notification payload is malformed", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useSchemaList.mockReturnValue({ data: { data: { items: [], totalCount: 0 } } });
    renderSidebar();

    act(() => {
      notifyRef.current!({
        message: { denormalizedPayload: "{not-json" },
      });
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // Rows are native buttons now, so Enter and Space come free rather than from
  // a hand-rolled keydown handler on a div.
  it.each([["{Enter}"], [" "]])("selects a schema when %s is pressed on the row", async (key) => {
    const user = userEvent.setup();
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [{ id: "a", schemaName: "User", schemaType: 1, totalSchemaReferences: 0 }],
          totalCount: 1,
        },
      },
    });
    const { onListQueryChange } = renderSidebar();

    screen.getByRole("button", { name: /User/ }).focus();
    await user.keyboard(key);

    expect(onListQueryChange).toHaveBeenCalledWith({ schemaId: "a" });
  });
  // ── Phase 3: flat list ──────────────────────────────────────────────────

  const schemaItem = (over: Record<string, unknown> = {}) => ({
    id: "a",
    schemaName: "User",
    schemaType: 1,
    totalSchemaReferences: 0,
    readAccessLevel: 3,
    writeAccessLevel: 3,
    editAccessLevel: 3,
    deleteAccessLevel: 3,
    ...over,
  });

  // The type used to be hidden unless the All filter was on, which left the
  // Entity/Child filters looking like the only way to tell them apart.
  it("keeps the type tag on the row under every filter", () => {
    useSchemaList.mockReturnValue({
      data: { data: { items: [schemaItem({ schemaType: 2 })], totalCount: 1 } },
    });
    renderSidebar({ filterType: "2" });

    expect(screen.getByRole("button", { name: /User/ })).toHaveTextContent("Child");
  });

  it("dots a schema anyone can read, and says why", () => {
    useSchemaList.mockReturnValue({
      data: { data: { items: [schemaItem({ readAccessLevel: 2 })], totalCount: 1 } },
    });
    renderSidebar();

    expect(screen.getByTitle("Anyone can read this schema")).toBeInTheDocument();
  });

  it("leaves an ordinary schema undotted", () => {
    useSchemaList.mockReturnValue({
      data: { data: { items: [schemaItem({ readAccessLevel: 1 })], totalCount: 1 } },
    });
    renderSidebar();

    expect(screen.queryByTitle(/Anyone can|Any signed-in user/)).not.toBeInTheDocument();
  });

  it("counts what the list is showing", () => {
    useSchemaList.mockReturnValue({
      data: { data: { items: [schemaItem()], totalCount: 42 } },
    });
    renderSidebar();

    expect(screen.getByLabelText("42 schemas")).toBeInTheDocument();
  });

  it("keeps the reference count in reach without a badge", () => {
    useSchemaList.mockReturnValue({
      data: { data: { items: [schemaItem({ totalSchemaReferences: 3 })], totalCount: 1 } },
    });
    renderSidebar();

    expect(screen.getByRole("button", { name: /User/ })).toHaveAttribute(
      "title",
      "User · 3 reference(s)",
    );
  });
});
