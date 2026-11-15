import { StrictMode, type ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const executeGraphQL = vi.fn();
const projection = vi.hoisted(() => ({ fields: ["name"] }));

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useExecuteGraphQL: () => ({ mutateAsync: executeGraphQL }),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantSlug: "slug1" } }),
  // http-client.ts constructs HttpClient instances at import time and re-exports HttpError.
  HttpClient: class {
    get() {}
    post() {}
    put() {}
    delete() {}
  },
  // The tab narrows on `err instanceof HttpError` to tell a 404 apart from any
  // other failure. Leaving it off the mock made that check throw inside the
  // catch block, so no error ever reached the screen.
  // Shaped like genesis-os: the message is the JSON text of `errors`, and the
  // gateway's errors array stays available on `errors`.
  HttpError: class HttpError extends Error {
    errors: unknown;
    constructor(
      public status: number,
      body?: { errors?: unknown },
    ) {
      super(JSON.stringify(body?.errors));
      this.errors = body?.errors;
    }
  },
}));

vi.mock("./toolbar/filter-popover", () => ({
  FilterPopover: ({ onApply }: { onApply: (f: string) => void }) => (
    <button onClick={() => onApply('{"name":"x"}')}>apply-filter</button>
  ),
}));
vi.mock("./toolbar/projection-popover", () => ({
  ProjectionPopover: ({ onApply }: { onApply: (f: string[]) => void }) => (
    <button onClick={() => onApply(projection.fields)}>apply-projection</button>
  ),
}));
vi.mock("./toolbar/sort-popover", () => ({
  SortPopover: ({
    onApply,
    onClear,
  }: {
    onApply: (f: string, d: "asc" | "desc") => void;
    onClear: () => void;
  }) => (
    <>
      <button onClick={() => onApply("name", "desc")}>apply-sort</button>
      <button onClick={onClear}>clear-sort</button>
    </>
  ),
}));
vi.mock("./toolbar/reset-button", () => ({
  ResetButton: ({ onReset }: { onReset: () => void }) => (
    <button onClick={onReset}>reset-all</button>
  ),
}));
vi.mock("./toolbar/data-pagination", () => ({
  DataPagination: ({
    onPageChange,
    onPageSizeChange,
  }: {
    onPageChange: (p: number) => void;
    onPageSizeChange: (v: string) => void;
  }) => (
    <>
      <button onClick={() => onPageChange(2)}>next-page</button>
      <button onClick={() => onPageSizeChange("50")}>size-50</button>
    </>
  ),
}));

import { SchemaDataTab } from "./schema-data-tab";
import { HttpError } from "@/lib/http-client";

const fields = [
  { name: "name", isArray: false },
  { name: "email", isArray: false, isPIIData: true },
];

function renderTab(previewData: Record<string, unknown> = {}) {
  render(
    <TooltipProvider>
      <SchemaDataTab schemaName="User" fields={fields} previewData={previewData} />
    </TooltipProvider>,
  );
}

describe("SchemaDataTab", () => {
  beforeEach(() => {
    executeGraphQL.mockReset();
    projection.fields = ["name"];
  });

  it("fetches on mount with a query for the schema and renders rows", async () => {
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [{ name: "Alice", email: "a@b.c" }], totalCount: 1 } },
    });
    renderTab();

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(executeGraphQL).toHaveBeenCalledWith(
      expect.objectContaining({
        projectShortKey: "slug1",
        query: expect.stringContaining("getUsers("),
      }),
    );
  });

  it("shows the empty state when no records come back", async () => {
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [], totalCount: 0 } },
    });
    renderTab();
    expect(await screen.findByText("No data found")).toBeInTheDocument();
  });

  it("shows the error state when the query fails", async () => {
    executeGraphQL.mockRejectedValue(new Error("boom"));
    renderTab();

    expect(await screen.findByText("Failed to fetch data")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("switches to the JSON view when its toggle is clicked", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [{ name: "Alice", email: "a@b.c" }], totalCount: 1 } },
    });
    renderTab();
    await screen.findByText("Alice");

    await user.click(screen.getByRole("button", { name: "JSON view" }));
    // JSON view labels each record with a #index
    expect(await screen.findByText("#1")).toBeInTheDocument();
  });

  it("masks PII columns in the fetched data", async () => {
    executeGraphQL.mockResolvedValue({
      data: {
        getUsers: {
          items: [{ name: "Alice", email: "secret@example.com" }],
          totalCount: 1,
        },
      },
    });
    renderTab();
    await screen.findByText("Alice");

    await waitFor(() =>
      expect(screen.queryByText("secret@example.com")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("builds a nested selection set from preview data on mount", async () => {
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [], totalCount: 0 } },
    });
    render(
      <TooltipProvider>
        <SchemaDataTab
          schemaName="User"
          fields={[
            { name: "name", isArray: false },
            { name: "tags", isArray: true },
            { name: "address", isArray: false },
          ]}
          previewData={{
            name: "n",
            tags: [{ label: "l", meta: { a: 1 } }],
            address: { city: "c" },
          }}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const query = executeGraphQL.mock.calls[0][0].query as string;
    expect(query).toContain("tags {");
    expect(query).toContain("address {");
  });

  it("applies a filter and re-queries with a filter clause", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());

    await user.click(screen.getByText("apply-filter"));
    await waitFor(() => {
      const last = executeGraphQL.mock.calls.at(-1)![0].query as string;
      expect(last).toContain("filter:");
    });
  });

  it("applies a projection and re-queries", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const before = executeGraphQL.mock.calls.length;
    await user.click(screen.getByText("apply-projection"));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("applies a sort and re-queries with a sort clause", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());

    await user.click(screen.getByText("apply-sort"));
    await waitFor(() => {
      const last = executeGraphQL.mock.calls.at(-1)![0].query as string;
      expect(last).toContain("sort:");
    });
  });

  it("changes page and page size through pagination", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [{ name: "A" }], totalCount: 40 } } });
    renderTab();
    await screen.findByText("A");
    const before = executeGraphQL.mock.calls.length;

    await user.click(screen.getByText("next-page"));
    await user.click(screen.getByText("size-50"));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before + 1),
    );
  });

  it("resets all filters through the reset button", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const before = executeGraphQL.mock.calls.length;
    await user.click(screen.getByText("reset-all"));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("refreshes the current page via the refresh button", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const before = executeGraphQL.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("shows a server-status message on a 404 error", async () => {
    executeGraphQL.mockRejectedValue(new HttpError(404, { errors: {} }));
    renderTab();
    expect(
      await screen.findByText("Please check the server status"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Drift between the form fields and the published gateway type
// ---------------------------------------------------------------------------

type Ref = { kind: string; name: string | null; ofType: Ref | null };
const scalarRef: Ref = { kind: "SCALAR", name: "String", ofType: null };
const objectRef = (name: string): Ref => ({ kind: "OBJECT", name, ofType: null });
const listRef = (ofType: Ref): Ref => ({ kind: "LIST", name: null, ofType });
const gqlField = (name: string, type: Ref = scalarRef) => ({ name, args: [], type });

/** `Query.getUsers → UserResult.items: [User]` with the given User fields. */
function userIntrospection(userFields: string[], extraQueryFields: string[] = []) {
  return {
    data: {
      __schema: {
        queryType: { name: "Query" },
        types: [
          {
            kind: "OBJECT",
            name: "Query",
            fields: [
              gqlField("getUsers", objectRef("UserResult")),
              ...extraQueryFields.map((name) => gqlField(name, objectRef("UserResult"))),
            ],
          },
          {
            kind: "OBJECT",
            name: "UserResult",
            fields: [gqlField("totalCount"), gqlField("items", listRef(objectRef("User")))],
          },
          { kind: "OBJECT", name: "User", fields: userFields.map((name) => gqlField(name)) },
        ],
      },
    },
  };
}

const driftFields = [
  { name: "name", isArray: false },
  { name: "email", isArray: false, isPIIData: true },
  { name: "age", isArray: false },
];

type TabProps = ComponentProps<typeof SchemaDataTab>;

function renderDataTab(overrides: Partial<TabProps> = {}) {
  const props: TabProps = {
    schemaName: "User",
    fields: driftFields,
    previewData: {},
    rawIntrospection: userIntrospection(["name", "email"]),
    ...overrides,
  };
  const view = render(
    <TooltipProvider>
      <SchemaDataTab {...props} />
    </TooltipProvider>,
  );
  const rerender = (next: Partial<TabProps>) =>
    view.rerender(
      <TooltipProvider>
        <SchemaDataTab {...props} {...next} />
      </TooltipProvider>,
    );
  return { ...view, rerender };
}

/** The top-level names inside `items { … }` of a sent query. */
function selectedNames(query: string): string[] {
  const items = query.split("items {\n")[1].split("\n    }\n")[0];
  return items
    .split("\n")
    .filter((line) => /^ {6}\S/.test(line))
    .map((line) => line.trim().replace(/ \{$/, ""));
}

const lastQuery = () => executeGraphQL.mock.calls.at(-1)![0].query as string;
const rowsResponse = (items: Record<string, unknown>[], totalCount = items.length) => ({
  data: { getUsers: { items, totalCount } },
});
const fieldError = (message: string) => new HttpError(400, { errors: [{ message }] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const hasSkeleton = (container: HTMLElement) => container.querySelector(".animate-pulse") !== null;

describe("SchemaDataTab drift handling", () => {
  beforeEach(() => {
    executeGraphQL.mockReset();
    projection.fields = ["name"];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("H1: selects the same fields in the same order as the form-built query when nothing drifted", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice" }]));
    const fields = driftFields.slice(0, 2);
    const formBuilt = renderDataTab({ fields, rawIntrospection: undefined });
    await screen.findByText("Alice");
    const formQuery = lastQuery();
    formBuilt.unmount();

    renderDataTab({ fields });
    await screen.findByText("Alice");
    expect(executeGraphQL).toHaveBeenCalledTimes(2);
    expect(lastQuery()).toBe(formQuery);
    expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("H2/H3/H7: leaves out the missing field, renders rows in every view and lists it in the notice", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice", email: "a@b.c" }]));
    renderDataTab();

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
    expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Some fields aren't in the live version yet");
    expect(notice).toHaveTextContent("They're left out of the results until you publish the schema:");
    expect(within(notice).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["age"]);
    expect(screen.queryByText("Failed to fetch data")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "JSON view" }));
    expect(await screen.findByText("#1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("H3: lists each missing field once, in form order", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    renderDataTab({
      fields: [
        { name: "zeta", isArray: false },
        { name: "name", isArray: false },
        { name: "alpha", isArray: false },
        { name: "zeta", isArray: false },
      ],
    });
    const notice = await screen.findByRole("status");
    expect(within(notice).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["zeta", "alpha"]);
  });

  it("H6: shows the notice together with the empty state", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    renderDataTab();
    expect(await screen.findByText("No data found")).toBeInTheDocument();
    expect(screen.getByText("This schema has no records yet.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("age");
  });

  it("H13/C16: uses the shared Alert's warning variant with wrapping monospace names", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    renderDataTab();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveAttribute("data-slot", "alert");
    expect(notice).toHaveClass("border-warning-500/50", "bg-warning-100", "text-warning-800", "shrink-0");
    expect(notice.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(notice.querySelector("[data-slot=alert-title]")).toHaveClass("line-clamp-none");
    expect(within(notice).getByText("age")).toHaveClass("break-all", "font-mono");
  });

  it("H4: builds nested selections from the introspected object type", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    const raw = userIntrospection(["name"]);
    const userType = raw.data.__schema.types[2];
    userType.fields.push(gqlField("address", objectRef("Address")));
    raw.data.__schema.types.push({ kind: "OBJECT", name: "Address", fields: [gqlField("city")] });
    renderDataTab({
      fields: [
        { name: "name", isArray: false },
        { name: "address", isArray: false },
      ],
      // The saved child definition, which the live type no longer matches.
      previewData: { address: { street: "s", city: "c" } },
      rawIntrospection: raw,
    });
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(1));
    expect(lastQuery()).toContain("      address {\n        city\n      }");
    expect(lastQuery()).not.toContain("street");
  });

  it("H5/E5/C1: waits on the skeleton while introspection is pending, then sends exactly one query", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice" }]));
    const { container, rerender } = renderDataTab({
      rawIntrospection: undefined,
      introspectionPending: true,
    });

    expect(hasSkeleton(container)).toBe(true);
    await act(async () => {});
    expect(executeGraphQL).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch data")).not.toBeInTheDocument();

    rerender({ rawIntrospection: userIntrospection(["name", "email"]), introspectionPending: false });
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
    expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
    expect(screen.getByRole("status")).toHaveTextContent("age");
  });

  it("C11: sends nothing when the tab unmounts while introspection is pending", () => {
    vi.useFakeTimers();
    const { unmount } = renderDataTab({ rawIntrospection: undefined, introspectionPending: true });
    unmount();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(executeGraphQL).not.toHaveBeenCalled();
  });

  it("C19: stops waiting after 15 s and queries from the form fields, then skips an unchanged selection", async () => {
    vi.useFakeTimers();
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice" }]));
    const fields = driftFields.slice(0, 2);
    const { rerender } = renderDataTab({
      fields,
      rawIntrospection: undefined,
      introspectionPending: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(14_900);
    });
    expect(executeGraphQL).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
    expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
    expect(screen.getByText("Alice")).toBeInTheDocument();

    rerender({ fields, rawIntrospection: userIntrospection(["name", "email"]), introspectionPending: false });
    await act(async () => {});
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
  });

  it("C19: re-queries once if introspection resolves after the wait with a different selection", async () => {
    vi.useFakeTimers();
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    const { rerender } = renderDataTab({ rawIntrospection: undefined, introspectionPending: true });
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
    expect(selectedNames(lastQuery())).toEqual(["name", "email", "age"]);

    rerender({ rawIntrospection: userIntrospection(["name", "email"]), introspectionPending: false });
    await act(async () => {});
    expect(executeGraphQL).toHaveBeenCalledTimes(2);
    expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
  });

  it("keeps a filter applied while waiting and sends it with the first query", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    const { rerender } = renderDataTab({ rawIntrospection: undefined, introspectionPending: true });

    await user.click(screen.getByText("apply-filter"));
    expect(executeGraphQL).not.toHaveBeenCalled();

    rerender({ rawIntrospection: userIntrospection(["name", "email"]), introspectionPending: false });
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(1));
    expect(lastQuery()).toContain("filter:");
  });

  it("H8: keeps the drift-filtered selection for paging, filter, sort, reset and refresh", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "A" }], 40));
    renderDataTab();
    await screen.findByText("A");

    for (const label of ["next-page", "size-50", "apply-filter", "apply-sort", "reset-all"]) {
      const before = executeGraphQL.mock.calls.length;
      await user.click(screen.getByText(label));
      await waitFor(() => expect(executeGraphQL.mock.calls.length).toBe(before + 1));
      expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
      await screen.findByText("A");
    }
    const before = executeGraphQL.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(executeGraphQL.mock.calls.length).toBe(before + 1));
    expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
  });

  it("H9: ignores a missing field in the projection", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    renderDataTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(1));

    projection.fields = ["age", "name"];
    await user.click(screen.getByText("apply-projection"));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(2));
    expect(selectedNames(lastQuery())).toEqual(["name"]);
  });

  it("H9: selects every selectable field when the projection keeps none", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue(rowsResponse([]));
    renderDataTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(1));

    projection.fields = ["age"];
    await user.click(screen.getByText("apply-projection"));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(2));
    expect(selectedNames(lastQuery())).toEqual(["name", "email"]);
  });

  it("H10: re-queries once with the current page, filter and sort when introspection changes the selection", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "A" }], 40));
    const { rerender } = renderDataTab();
    await screen.findByText("A");
    await user.click(screen.getByText("apply-filter"));
    await screen.findByText("A");
    await user.click(screen.getByText("apply-sort"));
    await screen.findByText("A");
    await user.click(screen.getByText("next-page"));
    await screen.findByText("A");
    const before = executeGraphQL.mock.calls.length;
    expect(screen.getByRole("status")).toHaveTextContent("age");

    // A publish re-seeds introspection, now with "age".
    rerender({ rawIntrospection: userIntrospection(["name", "email", "age"]) });
    await waitFor(() => expect(executeGraphQL.mock.calls.length).toBe(before + 1));
    const query = lastQuery();
    expect(selectedNames(query)).toEqual(["name", "email", "age"]);
    expect(query).toContain("pageNo: 2");
    expect(query).toContain("filter:");
    expect(query).toContain("sort:");
    await screen.findByText("A");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => {});
    expect(executeGraphQL.mock.calls.length).toBe(before + 1);
  });

  it("C10/E10: sends nothing when the parent re-renders with equal but new props", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice" }]));
    const raw = userIntrospection(["name", "email"]);
    const { rerender } = renderDataTab({ rawIntrospection: raw });
    await screen.findByText("Alice");

    rerender({
      fields: structuredClone(driftFields),
      previewData: {},
      rawIntrospection: structuredClone(raw),
    });
    await act(async () => {});
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
  });

  it("C9: ignores an older request that settles after a newer one", async () => {
    const user = userEvent.setup();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    executeGraphQL.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderDataTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("apply-filter"));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(2));

    await act(async () => second.resolve(rowsResponse([{ name: "Newer" }])));
    expect(await screen.findByText("Newer")).toBeInTheDocument();

    await act(async () => first.resolve(rowsResponse([{ name: "Older" }])));
    expect(screen.queryByText("Older")).not.toBeInTheDocument();
    expect(screen.getByText("Newer")).toBeInTheDocument();
  });

  it("C9: ignores an older request's error and loading state", async () => {
    const user = userEvent.setup();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    executeGraphQL.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { container } = renderDataTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(1));
    await user.click(screen.getByText("apply-filter"));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(2));

    await act(async () => first.reject(new Error("stale failure")));
    expect(screen.queryByText("stale failure")).not.toBeInTheDocument();
    expect(hasSkeleton(container)).toBe(true);

    await act(async () => second.resolve(rowsResponse([{ name: "Newer" }])));
    expect(await screen.findByText("Newer")).toBeInTheDocument();
  });

  it("H11/E7/C17: maps field errors to an actionable message with keyboard-operable details", async () => {
    const user = userEvent.setup();
    const error = fieldError("Field `Start` does not exist on type `AttendanceBreak`.");
    executeGraphQL.mockRejectedValue(error);
    renderDataTab({ rawIntrospection: undefined });

    expect(await screen.findByText("Failed to fetch data")).toBeInTheDocument();
    expect(screen.getByText("The live version doesn't have these fields yet:")).toBeInTheDocument();
    expect(screen.getByText("Start (on AttendanceBreak)")).toBeInTheDocument();
    expect(screen.getByText("Publish the schema, then refresh.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const details = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(details).not.toBeVisible();
    expect(details.textContent).toBe(error.message);

    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Hide details");
    expect(details).toBeVisible();
    expect(details).toHaveTextContent("does not exist on type");

    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(details).not.toBeVisible();
  });

  it("H11: names each field and type once", async () => {
    executeGraphQL.mockRejectedValue(
      new HttpError(400, {
        errors: [
          { message: "Field `StartTimeUtc` does not exist on type `Attendance`." },
          { message: "Field `Start` does not exist on type `AttendanceBreak`." },
          { message: "Field `Start` does not exist on type `AttendanceBreak`." },
        ],
      }),
    );
    renderDataTab({ rawIntrospection: undefined });
    await screen.findByText("Failed to fetch data");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "StartTimeUtc (on Attendance)",
      "Start (on AttendanceBreak)",
    ]);
  });

  it("H12/E6: still queries a schema missing from the live version and explains the error", async () => {
    executeGraphQL.mockRejectedValue(fieldError("Field `getDraftThings` does not exist on type `Query`."));
    renderDataTab({ schemaName: "DraftThing", fields: [{ name: "title", isArray: false }] });

    expect(await screen.findByText("Failed to fetch data")).toBeInTheDocument();
    expect(
      screen.getByText("This schema isn't in the live version yet. Publish it, then refresh."),
    ).toBeInTheDocument();
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toContain("getDraftThings(");
    expect(selectedNames(lastQuery())).toEqual(["title"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show details" })).toBeInTheDocument();
  });

  it("H12: recognises the missing list field on the default query type without introspection", async () => {
    executeGraphQL.mockRejectedValue(fieldError("Field `getUsers` does not exist on type `Query`."));
    renderDataTab({ rawIntrospection: undefined });
    expect(
      await screen.findByText("This schema isn't in the live version yet. Publish it, then refresh."),
    ).toBeInTheDocument();
  });

  it("C8/E11: keeps today's message for a mixed error list", async () => {
    const error = new HttpError(400, {
      errors: [{ message: "Field `X` does not exist on type `A`." }, { message: "Unexpected Execution Error" }],
    });
    executeGraphQL.mockRejectedValue(error);
    renderDataTab({ rawIntrospection: undefined });
    expect(await screen.findByText("Failed to fetch data")).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show details" })).not.toBeInTheDocument();
  });

  it("C8: keeps today's message for a non-HttpError value", async () => {
    executeGraphQL.mockRejectedValue("plain failure");
    renderDataTab();
    expect(await screen.findByText("plain failure")).toBeInTheDocument();
  });

  it("C7: keeps the server-status message on a 404 with drift", async () => {
    executeGraphQL.mockRejectedValue(new HttpError(404, { errors: {} }));
    renderDataTab();
    expect(await screen.findByText("Please check the server status")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("C12: masks a PII field that the live type serves", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice", email: "secret@example.com" }]));
    renderDataTab();
    await screen.findByText("Alice");
    expect(screen.queryByText("secret@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("C18: renders HTML-like error text literally", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockRejectedValue(fieldError("Field `<b>x</b>` does not exist on type `A`."));
    const { container } = renderDataTab({ rawIntrospection: undefined });
    expect(await screen.findByText("<b>x</b> (on A)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show details" }));
    expect(container.querySelector("b")).toBeNull();
  });

  it("C2/C3: builds the form query without a notice when introspection is malformed or throws", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice" }]));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing = {
      get data(): unknown {
        throw new Error("broken introspection");
      },
    };
    const { unmount } = renderDataTab({ rawIntrospection: throwing });
    await screen.findByText("Alice");
    expect(selectedNames(lastQuery())).toEqual(["name", "email", "age"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
    unmount();

    renderDataTab({ rawIntrospection: { data: { __schema: { types: {} } } } });
    await screen.findByText("Alice");
    expect(selectedNames(lastQuery())).toEqual(["name", "email", "age"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("starts over with a fresh first query when the schema changes", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice" }], 40));
    const user = userEvent.setup();
    const { rerender } = renderDataTab();
    await screen.findByText("Alice");
    await user.click(screen.getByText("next-page"));
    await screen.findByText("Alice");

    executeGraphQL.mockResolvedValue({ data: { getAccounts: { items: [], totalCount: 0 } } });
    rerender({ schemaName: "Account", fields: [{ name: "title", isArray: false }] });
    await waitFor(() => expect(lastQuery()).toContain("getAccounts("));
    expect(lastQuery()).toContain("pageNo: 1");
    expect(await screen.findByText("No data found")).toBeInTheDocument();
  });

  it("renders rows under StrictMode's double effects", async () => {
    executeGraphQL.mockResolvedValue(rowsResponse([{ name: "Alice" }]));
    render(
      <StrictMode>
        <TooltipProvider>
          <SchemaDataTab
            schemaName="User"
            fields={driftFields}
            previewData={{}}
            rawIntrospection={userIntrospection(["name", "email"])}
          />
        </TooltipProvider>
      </StrictMode>,
    );
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
  });
});
