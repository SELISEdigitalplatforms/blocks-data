import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const getRoles = vi.fn();
const getUsers = vi.fn();
const getUserById = vi.fn();

vi.mock("@blocks-idp/iam/services/role.service", () => ({
  roleService: { getRoles: (...a: unknown[]) => getRoles(...a) },
}));
vi.mock("@blocks-idp/iam/services/user.service", () => ({
  userService: {
    getUsers: (...a: unknown[]) => getUsers(...a),
    getUserById: (...a: unknown[]) => getUserById(...a),
  },
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

/**
 * Mirrors the shape the shared client rejects with (`app/lib/http-client.ts`) without importing
 * it: that module builds HttpClient instances at import time and would pull genesis-os in.
 */
class StatusError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

import { PrincipalSelector, PRINCIPAL_MESSAGES } from "./principal-selector";
import {
  dedupeOptions,
  nextPageParam,
  PRINCIPAL_PAGE_SIZE,
  userToOption,
} from "@/data-gateway/hooks/use-principal-options";

const role = (slug: string, name = slug) => ({
  itemId: `id-${slug}`,
  name,
  slug,
  description: "",
});

const user = (itemId: string, extra: Record<string, unknown> = {}) => ({
  itemId,
  firstName: "Ada",
  lastName: "Lovelace",
  userName: "ada",
  email: "ada@example.com",
  active: true,
  ...extra,
});

const renderSelector = (props: Partial<Parameters<typeof PrincipalSelector>[0]> = {}) => {
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <PrincipalSelector
        entity="role"
        projectKey="tenant-a"
        value=""
        onChange={onChange}
        multiple={false}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onChange };
};

beforeEach(() => {
  vi.clearAllMocks();
  getRoles.mockResolvedValue({ data: [], totalCount: 0, errors: null });
  getUsers.mockResolvedValue({ data: [], totalCount: 0, errors: null });
  getUserById.mockResolvedValue({ data: undefined, errors: null });
});

describe("PrincipalSelector — happy path", () => {
  it("H1: roles single-select shows name and slug and stores the slug", async () => {
    getRoles.mockResolvedValue({
      data: [role("project-admin", "Project Admin")],
      totalCount: 1,
      errors: null,
    });
    const { onChange } = renderSelector();

    await userEvent.click(screen.getByRole("button"));
    const item = await screen.findByText("Project Admin");
    expect(screen.getByText("project-admin")).toBeInTheDocument();

    await userEvent.click(item);
    expect(onChange).toHaveBeenCalledWith("project-admin");
  });

  it("H2: roles multi-select stores unique slugs, comma-delimited, in selection order", async () => {
    getRoles.mockResolvedValue({
      data: [role("editor", "Editor"), role("reviewer", "Reviewer")],
      totalCount: 2,
      errors: null,
    });
    const { onChange } = renderSelector({ multiple: true, value: "editor" });

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(await screen.findByText("Reviewer"));

    expect(onChange).toHaveBeenCalledWith("editor,reviewer");
  });

  it("H2: re-selecting an already-stored role removes it rather than duplicating", async () => {
    getRoles.mockResolvedValue({
      data: [role("editor", "Editor"), role("reviewer", "Reviewer")],
      totalCount: 2,
      errors: null,
    });
    const { onChange } = renderSelector({
      multiple: true,
      value: "editor,reviewer",
    });

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(await screen.findByTestId("browse-option-editor"));

    expect(onChange).toHaveBeenCalledWith("reviewer");
  });

  it("H3: user select shows display name and email but stores itemId, never the email", async () => {
    getUsers.mockResolvedValue({
      data: [user("usr-42")],
      totalCount: 1,
      errors: null,
    });
    const { onChange } = renderSelector({ entity: "user" });

    await userEvent.click(screen.getByRole("button"));
    const item = await screen.findByText("Ada Lovelace");
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();

    await userEvent.click(item);
    expect(onChange).toHaveBeenCalledWith("usr-42");
    expect(onChange).not.toHaveBeenCalledWith("ada@example.com");
  });

  it("H3: display name falls back to userName then email", () => {
    expect(
      userToOption(user("u1", { firstName: "", lastName: "" }) as never)
        .primaryLabel,
    ).toBe("ada");
    expect(
      userToOption(
        user("u1", { firstName: "", lastName: "", userName: "" }) as never,
      ).primaryLabel,
    ).toBe("ada@example.com");
  });

  it("H4: queries carry the current tenant and the search term", async () => {
    renderSelector({ projectKey: "tenant-b" });
    await userEvent.click(screen.getByRole("button"));
    await userEvent.type(await screen.findByPlaceholderText("Search roles"), "adm");

    await waitFor(() =>
      expect(getRoles).toHaveBeenCalledWith(
        expect.objectContaining({
          projectKey: "tenant-b",
          page: 0,
          filter: { search: "adm" },
        }),
      ),
    );
  });

  it("H4: pagination is 0-based — the first page is page 0, not page 1", async () => {
    renderSelector();
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(getRoles).toHaveBeenCalled());
    expect(getRoles.mock.calls[0][0].page).toBe(0);
  });
});

describe("PrincipalSelector — stored values (H5)", () => {
  it("H5: preselects a stored value and labels it from a targeted lookup", async () => {
    getRoles.mockImplementation((payload: { filter?: { slugs?: string[] } }) =>
      Promise.resolve(
        payload.filter?.slugs
          ? { data: [role("editor", "Editor")], totalCount: 1, errors: null }
          : { data: [], totalCount: 0, errors: null },
      ),
    );
    renderSelector({ value: "editor" });

    expect(await screen.findByText("Editor")).toBeInTheDocument();
  });

  it("H5: a stored value the tenant no longer has is marked Unavailable and kept", async () => {
    getRoles.mockImplementation((payload: { filter?: { slugs?: string[] } }) =>
      Promise.resolve(
        payload.filter?.slugs
          ? { data: [role("editor", "Editor")], totalCount: 1, errors: null }
          : { data: [], totalCount: 0, errors: null },
      ),
    );
    const { onChange } = renderSelector({
      multiple: true,
      value: "legacy-role,editor",
    });

    expect(
      await screen.findByText(/legacy-role — Unavailable/),
    ).toBeInTheDocument();
    // Never rewritten behind the administrator's back.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("H5: a FAILED lookup is never reported as Unavailable", async () => {
    getUserById.mockRejectedValue(new Error("network down"));
    renderSelector({ entity: "user", value: "usr-42" });

    await waitFor(() => expect(getUserById).toHaveBeenCalled());
    expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
    expect(screen.getByText("usr-42")).toBeInTheDocument();
  });

  it("H5: a 404 on a stored user IS Unavailable", async () => {
    getUserById.mockRejectedValue(new StatusError(404));
    renderSelector({ entity: "user", value: "usr-gone" });

    expect(await screen.findByText(/usr-gone — Unavailable/)).toBeInTheDocument();
  });

  it("H5: stored values resolve without opening the popover", async () => {
    getRoles.mockResolvedValue({
      data: [role("editor", "Editor")],
      totalCount: 1,
      errors: null,
    });
    renderSelector({ value: "editor" });

    await waitFor(() => expect(getRoles).toHaveBeenCalled());
    expect(getRoles.mock.calls[0][0].filter).toEqual({ slugs: ["editor"] });
  });
});

describe("PrincipalSelector — critical path", () => {
  it("C1: with no tenant it makes no IAM request and says so", async () => {
    renderSelector({ projectKey: "" });

    expect(screen.getByText(PRINCIPAL_MESSAGES.MISSING_TENANT)).toBeInTheDocument();
    expect(getRoles).not.toHaveBeenCalled();
  });

  it("C2: a load failure is retryable and leaves the value untouched", async () => {
    getRoles.mockRejectedValue(new Error("boom"));
    const { onChange } = renderSelector({ value: "editor" });

    await userEvent.click(screen.getByRole("button"));
    expect(
      await screen.findByText(PRINCIPAL_MESSAGES.ROLES_FAILED),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("C2: no free-text fallback is offered when loading fails", async () => {
    getRoles.mockRejectedValue(new Error("boom"));
    renderSelector();

    await userEvent.click(screen.getByRole("button"));
    await screen.findByText(PRINCIPAL_MESSAGES.ROLES_FAILED);
    expect(screen.queryByPlaceholderText("Enter comma-separated values")).toBeNull();
  });

  it("C3: an empty result shows the empty state, not stale options", async () => {
    getRoles.mockResolvedValue({ data: [], totalCount: 0, errors: null });
    renderSelector();

    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(PRINCIPAL_MESSAGES.NO_ROLES)).toBeInTheDocument();
  });

  it("C4: 403 shows the permission message and exposes no principal data", async () => {
    getRoles.mockRejectedValue(new StatusError(403));
    renderSelector();

    await userEvent.click(screen.getByRole("button"));
    expect(
      await screen.findByText(PRINCIPAL_MESSAGES.FORBIDDEN),
    ).toBeInTheDocument();
    expect(screen.queryByText(PRINCIPAL_MESSAGES.ROLES_FAILED)).toBeNull();
  });

  it("C4/C5: changing tenant re-queries with the new tenant and drops the old options", async () => {
    getRoles.mockImplementation((payload: { projectKey: string }) =>
      Promise.resolve({
        data: [role(`${payload.projectKey}-slug`, `${payload.projectKey} Role`)],
        totalCount: 1,
        errors: null,
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const view = (projectKey: string) => (
      <QueryClientProvider client={client}>
        <PrincipalSelector
          entity="role"
          projectKey={projectKey}
          value=""
          onChange={vi.fn()}
          multiple={false}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view("tenant-a"));
    await userEvent.click(screen.getByRole("button"));
    await screen.findByText("tenant-a Role");

    rerender(view("tenant-b"));

    // The tenant-keyed remount means tenant A's option cannot survive even one commit.
    expect(screen.queryByText("tenant-a Role")).toBeNull();
  });
});

describe("pagination primitives (C5)", () => {
  const page = (rawCount: number, totalCount: number) => ({
    options: [],
    rawCount,
    totalCount,
  });

  it("C5: stops on a short final page", () => {
    expect(nextPageParam(page(3, 100), [page(3, 100)])).toBeUndefined();
  });

  it("C5: stops on an empty page", () => {
    expect(nextPageParam(page(0, 100), [page(0, 100)])).toBeUndefined();
  });

  it("C5: stops once raw records fetched reach totalCount", () => {
    const full = page(PRINCIPAL_PAGE_SIZE, PRINCIPAL_PAGE_SIZE * 2);
    expect(nextPageParam(full, [full, full])).toBeUndefined();
  });

  it("C5: continues while full pages remain, using 0-based page numbers", () => {
    const full = page(PRINCIPAL_PAGE_SIZE, PRINCIPAL_PAGE_SIZE * 3);
    expect(nextPageParam(full, [full])).toBe(1);
  });

  it("C5: a repeated item does not stall pagination forever", () => {
    // Termination counts RAW records, so duplicates cannot hold the loop open.
    const full = page(PRINCIPAL_PAGE_SIZE, PRINCIPAL_PAGE_SIZE);
    expect(nextPageParam(full, [full])).toBeUndefined();
  });

  it("C5: display de-duplicates by stored value, preserving first-seen order", () => {
    expect(
      dedupeOptions([
        { value: "a", primaryLabel: "A", secondaryLabel: "" },
        { value: "b", primaryLabel: "B", secondaryLabel: "" },
        { value: "a", primaryLabel: "A again", secondaryLabel: "" },
      ]).map((o) => o.value),
    ).toEqual(["a", "b"]);
  });
});

/**
 * Findings from code review cycle 1. Each of these is a way a wrong principal could end up in a
 * live access policy without anything throwing.
 */
describe("PrincipalSelector — review cycle 1 regressions", () => {
  it("drops a selection made under the previous tenant when the tenant changes", async () => {
    const onChange = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const view = (projectKey: string) => (
      <QueryClientProvider client={client}>
        <PrincipalSelector
          entity="role"
          projectKey={projectKey}
          value="admin"
          onChange={onChange}
          multiple={false}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view("tenant-a"));
    // Hydration under a stable tenant must NOT clear the stored value (H5).
    expect(onChange).not.toHaveBeenCalled();

    rerender(view("tenant-b"));

    // "admin" may exist in tenant B too - and would then be a DIFFERENT principal.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });

  it("does not clear the stored value on first render", async () => {
    const { onChange } = renderSelector({ value: "editor" });
    await waitFor(() => expect(getRoles).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalledWith("");
  });

  it("an unavailable value can still be removed from a multi-select", async () => {
    getRoles.mockImplementation((payload: { filter?: { slugs?: string[] } }) =>
      Promise.resolve(
        payload.filter?.slugs
          ? { data: [role("editor", "Editor")], totalCount: 1, errors: null }
          : { data: [role("editor", "Editor")], totalCount: 1, errors: null },
      ),
    );
    const { onChange } = renderSelector({
      multiple: true,
      value: "legacy-role,editor",
    });

    await userEvent.click(screen.getByRole("button"));
    // The unavailable slug is listed under "Selected" precisely so it can be deselected.
    const selected = await screen.findByTestId("selected-option-legacy-role");
    expect(selected).toHaveTextContent(/legacy-role/);
    await userEvent.click(selected);

    expect(onChange).toHaveBeenCalledWith("editor");
  });

  it("an unavailable single value can be cleared", async () => {
    getRoles.mockResolvedValue({ data: [], totalCount: 0, errors: null });
    const { onChange } = renderSelector({ value: "legacy-role" });

    await userEvent.click(screen.getByRole("button"));
    const selected = await screen.findByTestId("selected-option-legacy-role");
    expect(selected).toHaveTextContent(/legacy-role/);
    await userEvent.click(selected);

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("a lookup that returns a DIFFERENT user is not treated as resolved", async () => {
    getUserById.mockResolvedValue({
      data: {
        itemId: "someone-else",
        firstName: "Grace",
        lastName: "Hopper",
        userName: "grace",
        email: "grace@example.com",
        active: true,
      },
      errors: null,
    } as never);
    renderSelector({ entity: "user", value: "usr-42" });

    await waitFor(() => expect(getUserById).toHaveBeenCalled());
    // Must never label the stored id with another user's name.
    expect(screen.queryByText(/Grace Hopper/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /usr-42/ })).toBeInTheDocument();
  });
});

describe("PrincipalSelector — selection scope (review cycle 2)", () => {
  const scoped = (
    props: { projectKey: string; entity?: "role" | "user" },
    onChange: ReturnType<typeof vi.fn>,
    client: QueryClient,
  ) => (
    <QueryClientProvider client={client}>
      <PrincipalSelector
        entity={props.entity ?? "role"}
        projectKey={props.projectKey}
        value="admin"
        onChange={onChange}
        multiple={false}
      />
    </QueryClientProvider>
  );

  const newClient = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  it("a transient blank tenant does NOT clear the stored value", async () => {
    const onChange = vi.fn();
    const client = newClient();
    const { rerender } = render(scoped({ projectKey: "tenant-a" }, onChange, client));
    rerender(scoped({ projectKey: "" }, onChange, client));

    await waitFor(() => expect(getRoles).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalledWith("");
  });

  it("blank -> tenant still clears a value that belonged to an earlier tenant", async () => {
    const onChange = vi.fn();
    const client = newClient();
    const { rerender } = render(scoped({ projectKey: "tenant-a" }, onChange, client));
    rerender(scoped({ projectKey: "" }, onChange, client));
    rerender(scoped({ projectKey: "tenant-b" }, onChange, client));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });

  it("changing entity clears the value — a role slug must not be read as a user id", async () => {
    const onChange = vi.fn();
    const client = newClient();
    const { rerender } = render(
      scoped({ projectKey: "tenant-a", entity: "role" }, onChange, client),
    );
    rerender(scoped({ projectKey: "tenant-a", entity: "user" }, onChange, client));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });

  it("clears a stale value after a scope change (one interim commit still shows it)", async () => {
    const onChange = vi.fn();
    const client = newClient();
    const { rerender } = render(scoped({ projectKey: "tenant-a" }, onChange, client));
    expect(screen.getByRole("button", { name: /admin/ })).toBeInTheDocument();

    rerender(scoped({ projectKey: "tenant-b" }, onChange, client));

    // Cleared by the effect, not synchronously: the repo's React Compiler lint rules forbid both
    // reading a ref during render and setState-in-effect, so detection happens post-commit. The
    // value cannot be PERSISTED stale - submitting requires a click, long after this runs.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });

  it("a missing user (null data) is unavailable, not silently resolved", async () => {
    getUserById.mockResolvedValue({ data: null, errors: null } as never);
    renderSelector({ entity: "user", value: "usr-gone" });

    expect(await screen.findByText(/usr-gone — Unavailable/)).toBeInTheDocument();
  });
});
