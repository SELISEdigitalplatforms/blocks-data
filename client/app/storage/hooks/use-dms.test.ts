import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { DmsChildrenResponse } from "../models/dms.model";

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: Object.assign(() => ({ selectedProject: { tenantId: "tenant-1" } }), {
    getState: () => ({ selectedProject: { tenantId: "tenant-1" } }),
  }),
  // The IAM principal service imports `serviceInstances` from `@/lib/http-client`,
  // which in turn `new`s an HttpClient from genesis-os. The hooks under test do
  // not call it, so a no-op constructor keeps module evaluation cheap.
  HttpClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
  })),
}));

vi.mock("../services/iam-principal.service", () => ({
  iamPrincipalService: {
    getUsers: vi.fn(),
    getRoles: vi.fn(),
    getOrganizations: vi.fn(),
  },
}));

vi.mock("../services/dms-directory.service", () => ({
  dmsDirectoryService: {
    getChildren: vi.fn(),
    getDirectory: vi.fn(),
    createDirectory: vi.fn(),
    updateDirectory: vi.fn(),
    moveDirectory: vi.fn(),
    deleteDirectory: vi.fn(),
  },
  toQuery: vi.fn(),
}));

vi.mock("../services/dms-content.service", () => ({
  dmsContentService: {
    search: vi.fn(),
    getTrash: vi.fn(),
    restore: vi.fn(),
    deletePermanently: vi.fn(),
    getAccessPolicies: vi.fn(),
    grantAccess: vi.fn(),
    revokeAccessPolicy: vi.fn(),
    shareObject: vi.fn(),
    toggleInheritance: vi.fn(),
    getFileVersions: vi.fn(),
    copyFile: vi.fn(),
    moveFile: vi.fn(),
  },
}));

import { dmsContentService } from "../services/dms-content.service";
import { dmsDirectoryService } from "../services/dms-directory.service";
import {
  useAccessPolicies,
  useCopyFile,
  useCreateDmsDirectory,
  useDeleteDmsDirectory,
  useDeleteFromTrash,
  useDmsChildren,
  useDmsDirectory,
  useDmsSearch,
  useDmsTrash,
  useFileVersions,
  useGrantAccess,
  useMoveDmsDirectory,
  useMoveFile,
  useRestoreFromTrash,
  useRevokeAccess,
  useShareObject,
  useToggleInheritance,
  useUpdateDmsDirectory,
} from "./use-dms";

const page = (over: Partial<DmsChildrenResponse> = {}): DmsChildrenResponse => ({
  items: [],
  totalChildCount: 0,
  hasMore: false,
  ...over,
});

describe("useDmsChildren", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the root listing when no directory is selected", async () => {
    // The storage page previously relied on a removed DmsArtifact endpoint for the top
    // level. The new endpoint takes a directory id, so an unset one now means "the root",
    // and the hook fires before the user has opened anything.
    vi.mocked(dmsDirectoryService.getChildren).mockResolvedValue(page());

    renderHook(() => useDmsChildren(undefined), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsDirectoryService.getChildren).toHaveBeenCalledWith(
        expect.objectContaining({ directoryId: undefined, cursor: undefined }),
      ),
    );
  });

  it("requests the first page with no cursor", async () => {
    vi.mocked(dmsDirectoryService.getChildren).mockResolvedValue(page());

    renderHook(() => useDmsChildren("dir-1"), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsDirectoryService.getChildren).toHaveBeenCalledWith(
        expect.objectContaining({ directoryId: "dir-1", cursor: undefined }),
      ),
    );
  });

  it("passes the type and search filters through", async () => {
    vi.mocked(dmsDirectoryService.getChildren).mockResolvedValue(page());

    renderHook(() => useDmsChildren("dir-1", { type: "file", search: "report", limit: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(dmsDirectoryService.getChildren).toHaveBeenCalledWith(
        expect.objectContaining({ type: "file", search: "report", limit: 10 }),
      ),
    );
  });

  it("follows nextCursor when the server says there is more", async () => {
    vi.mocked(dmsDirectoryService.getChildren)
      .mockResolvedValueOnce(page({ hasMore: true, nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(page());

    const { result } = renderHook(() => useDmsChildren("dir-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    await result.current.fetchNextPage();

    await waitFor(() =>
      expect(dmsDirectoryService.getChildren).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: "cursor-2" }),
      ),
    );
  });

  it("stops paging once hasMore is false, even if a cursor is still present", async () => {
    // The server sends a cursor on the last page too. Treating that as "more" would
    // loop forever re-fetching an empty page.
    vi.mocked(dmsDirectoryService.getChildren).mockResolvedValue(
      page({ hasMore: false, nextCursor: "cursor-2" }),
    );

    const { result } = renderHook(() => useDmsChildren("dir-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("keeps each page separate so the caller can flatten without duplicates", async () => {
    vi.mocked(dmsDirectoryService.getChildren)
      .mockResolvedValueOnce(
        page({
          items: [{ itemId: "a" }, { itemId: "b" }] as never,
          hasMore: true,
          nextCursor: "c2",
        }),
      )
      .mockResolvedValueOnce(page({ items: [{ itemId: "c" }] as never }));

    const { result } = renderHook(() => useDmsChildren("dir-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    const flattened = result.current.data!.pages.flatMap((p) => p.items);
    expect(flattened.map((i) => i.itemId)).toEqual(["a", "b", "c"]);
  });
});

describe("useDmsSearch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays idle for an empty query", () => {
    renderHook(() => useDmsSearch({ query: "   " }), { wrapper: createWrapper() });

    expect(dmsContentService.search).not.toHaveBeenCalled();
  });

  it("searches once a term is supplied", async () => {
    vi.mocked(dmsContentService.search).mockResolvedValue(page());

    renderHook(() => useDmsSearch({ query: "report" }), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsContentService.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: "report" }),
      ),
    );
  });
});

describe("useDmsTrash", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the trash without needing a directory", async () => {
    vi.mocked(dmsContentService.getTrash).mockResolvedValue(page());

    renderHook(() => useDmsTrash(), { wrapper: createWrapper() });

    await waitFor(() => expect(dmsContentService.getTrash).toHaveBeenCalled());
  });

  it("narrows the trash to one kind when asked", async () => {
    vi.mocked(dmsContentService.getTrash).mockResolvedValue(page());

    renderHook(() => useDmsTrash({ type: "directory" }), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsContentService.getTrash).toHaveBeenCalledWith(
        expect.objectContaining({ type: "directory" }),
      ),
    );
  });
});

describe("the reads that depend on a selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("useDmsDirectory stays idle without a directory id", () => {
    renderHook(() => useDmsDirectory(undefined), { wrapper: createWrapper() });

    expect(dmsDirectoryService.getDirectory).not.toHaveBeenCalled();
  });

  it("useDmsDirectory loads once an id is supplied", async () => {
    vi.mocked(dmsDirectoryService.getDirectory).mockResolvedValue({} as never);

    renderHook(() => useDmsDirectory("dir-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(dmsDirectoryService.getDirectory).toHaveBeenCalledWith("dir-1"));
  });

  it("useAccessPolicies stays idle without a resource", () => {
    renderHook(() => useAccessPolicies(undefined), { wrapper: createWrapper() });

    expect(dmsContentService.getAccessPolicies).not.toHaveBeenCalled();
  });

  it("useAccessPolicies asks for inherited entries by default", async () => {
    vi.mocked(dmsContentService.getAccessPolicies).mockResolvedValue([]);

    renderHook(() => useAccessPolicies("res-1"), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsContentService.getAccessPolicies).toHaveBeenCalledWith("res-1", true),
    );
  });

  it("useFileVersions stays idle without a file", () => {
    renderHook(() => useFileVersions(undefined), { wrapper: createWrapper() });

    expect(dmsContentService.getFileVersions).not.toHaveBeenCalled();
  });

  it("useFileVersions pages from the first version", async () => {
    vi.mocked(dmsContentService.getFileVersions).mockResolvedValue({
      items: [],
      hasMore: false,
    } as never);

    renderHook(() => useFileVersions("file-1"), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsContentService.getFileVersions).toHaveBeenCalledWith("file-1", undefined),
    );
  });
});

describe("the mutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a directory through the directory service", async () => {
    vi.mocked(dmsDirectoryService.createDirectory).mockResolvedValue({ directoryId: "new" });

    const { result } = renderHook(() => useCreateDmsDirectory(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ name: "Reports", parentDirectoryId: "root" });

    expect(dmsDirectoryService.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Reports" }),
    );
  });

  it("updates a directory", async () => {
    vi.mocked(dmsDirectoryService.updateDirectory).mockResolvedValue({ directoryId: "dir-1" });

    const { result } = renderHook(() => useUpdateDmsDirectory(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ directoryId: "dir-1", name: "New" });

    expect(dmsDirectoryService.updateDirectory).toHaveBeenCalledWith({ directoryId: "dir-1", name: "New" });
  });

  it("moves a directory", async () => {
    vi.mocked(dmsDirectoryService.moveDirectory).mockResolvedValue({ directoryId: "dir-1" });

    const { result } = renderHook(() => useMoveDmsDirectory(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ directoryId: "dir-1", targetDirectoryId: "dir-2" });

    expect(dmsDirectoryService.moveDirectory).toHaveBeenCalled();
  });

  it("deletes a directory", async () => {
    vi.mocked(dmsDirectoryService.deleteDirectory).mockResolvedValue({ directoryId: "dir-1" });

    const { result } = renderHook(() => useDeleteDmsDirectory(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ directoryId: "dir-1" });

    expect(dmsDirectoryService.deleteDirectory).toHaveBeenCalledWith({ directoryId: "dir-1" });
  });

  it("restores from the trash", async () => {
    vi.mocked(dmsContentService.restore).mockResolvedValue({ resourceId: "res-1" });

    const { result } = renderHook(() => useRestoreFromTrash(), { wrapper: createWrapper() });
    await result.current.mutateAsync("res-1");

    expect(dmsContentService.restore).toHaveBeenCalledWith("res-1");
  });

  it("empties an item from the trash", async () => {
    vi.mocked(dmsContentService.deletePermanently).mockResolvedValue({ resourceId: "res-1" });

    const { result } = renderHook(() => useDeleteFromTrash(), { wrapper: createWrapper() });
    await result.current.mutateAsync("res-1");

    expect(dmsContentService.deletePermanently).toHaveBeenCalledWith("res-1");
  });

  it("grants access", async () => {
    vi.mocked(dmsContentService.grantAccess).mockResolvedValue({ itemId: "policy-1" });

    const { result } = renderHook(() => useGrantAccess("res-1"), { wrapper: createWrapper() });
    await result.current.mutateAsync({
      resourceId: "res-1",
      principalType: "Role",
      principalId: "editors",
      permission: "Edit",
      effect: "Allow",
    });

    expect(dmsContentService.grantAccess).toHaveBeenCalled();
  });

  it("revokes against the resource it was created for", async () => {
    vi.mocked(dmsContentService.revokeAccessPolicy).mockResolvedValue({ itemId: "policy-1" });

    const { result } = renderHook(() => useRevokeAccess("res-1"), { wrapper: createWrapper() });
    await result.current.mutateAsync("policy-1");

    expect(dmsContentService.revokeAccessPolicy).toHaveBeenCalledWith("res-1", "policy-1");
  });

  it("shares an object", async () => {
    vi.mocked(dmsContentService.shareObject).mockResolvedValue({ itemId: "policy-1" });

    const { result } = renderHook(() => useShareObject("res-1"), { wrapper: createWrapper() });
    await result.current.mutateAsync({
      resourceId: "res-1",
      principalType: "User",
      principalId: "user-2",
      permission: "View",
    });

    expect(dmsContentService.shareObject).toHaveBeenCalled();
  });

  it("toggles inheritance against its resource", async () => {
    vi.mocked(dmsContentService.toggleInheritance).mockResolvedValue({ itemId: "res-1" });

    const { result } = renderHook(() => useToggleInheritance("res-1"), { wrapper: createWrapper() });
    await result.current.mutateAsync(false);

    expect(dmsContentService.toggleInheritance).toHaveBeenCalledWith("res-1", false);
  });

  it("copies a file", async () => {
    vi.mocked(dmsContentService.copyFile).mockResolvedValue({ fileId: "new" });

    const { result } = renderHook(() => useCopyFile(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ fileId: "file-1", targetDirectoryId: "dir-2" });

    expect(dmsContentService.copyFile).toHaveBeenCalledWith("file-1", "dir-2", undefined);
  });

  it("moves a file", async () => {
    vi.mocked(dmsContentService.moveFile).mockResolvedValue({ fileId: "file-1" });

    const { result } = renderHook(() => useMoveFile(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ fileId: "file-1", targetDirectoryId: "dir-2" });

    expect(dmsContentService.moveFile).toHaveBeenCalledWith("file-1", "dir-2");
  });
});
