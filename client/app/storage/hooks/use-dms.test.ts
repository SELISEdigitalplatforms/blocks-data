import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { DmsChildrenResponse } from "../models/dms.model";

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: Object.assign(() => ({ selectedProject: { tenantId: "tenant-1" } }), {
    getState: () => ({ selectedProject: { tenantId: "tenant-1" } }),
  }),
}));

vi.mock("../services/dms-folder.service", () => ({
  dmsFolderService: {
    getChildren: vi.fn(),
    getFolder: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
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
    shareContent: vi.fn(),
    toggleInheritance: vi.fn(),
    getFileVersions: vi.fn(),
    copyFile: vi.fn(),
    moveFile: vi.fn(),
  },
}));

import { dmsContentService } from "../services/dms-content.service";
import { dmsFolderService } from "../services/dms-folder.service";
import {
  useAccessPolicies,
  useCopyFile,
  useCreateDmsFolder,
  useDeleteDmsFolder,
  useDeleteFromTrash,
  useDmsChildren,
  useDmsFolder,
  useDmsSearch,
  useDmsTrash,
  useFileVersions,
  useGrantAccess,
  useMoveDmsFolder,
  useMoveFile,
  useRestoreFromTrash,
  useRevokeAccess,
  useShareContent,
  useToggleInheritance,
  useUpdateDmsFolder,
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

  it("fetches the root listing when no folder is selected", async () => {
    // The storage page previously relied on a removed DmsArtifact endpoint for the top
    // level. The new endpoint takes a folder id, so an unset one now means "the root",
    // and the hook fires before the user has opened anything.
    vi.mocked(dmsFolderService.getChildren).mockResolvedValue(page());

    renderHook(() => useDmsChildren(undefined), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsFolderService.getChildren).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: undefined, cursor: undefined }),
      ),
    );
  });

  it("requests the first page with no cursor", async () => {
    vi.mocked(dmsFolderService.getChildren).mockResolvedValue(page());

    renderHook(() => useDmsChildren("dir-1"), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsFolderService.getChildren).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: "dir-1", cursor: undefined }),
      ),
    );
  });

  it("passes the type and search filters through", async () => {
    vi.mocked(dmsFolderService.getChildren).mockResolvedValue(page());

    renderHook(() => useDmsChildren("dir-1", { type: "file", search: "report", limit: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(dmsFolderService.getChildren).toHaveBeenCalledWith(
        expect.objectContaining({ type: "file", search: "report", limit: 10 }),
      ),
    );
  });

  it("follows nextCursor when the server says there is more", async () => {
    vi.mocked(dmsFolderService.getChildren)
      .mockResolvedValueOnce(page({ hasMore: true, nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(page());

    const { result } = renderHook(() => useDmsChildren("dir-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    await result.current.fetchNextPage();

    await waitFor(() =>
      expect(dmsFolderService.getChildren).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: "cursor-2" }),
      ),
    );
  });

  it("stops paging once hasMore is false, even if a cursor is still present", async () => {
    // The server sends a cursor on the last page too. Treating that as "more" would
    // loop forever re-fetching an empty page.
    vi.mocked(dmsFolderService.getChildren).mockResolvedValue(
      page({ hasMore: false, nextCursor: "cursor-2" }),
    );

    const { result } = renderHook(() => useDmsChildren("dir-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("keeps each page separate so the caller can flatten without duplicates", async () => {
    vi.mocked(dmsFolderService.getChildren)
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

  it("loads the trash without needing a folder", async () => {
    vi.mocked(dmsContentService.getTrash).mockResolvedValue(page());

    renderHook(() => useDmsTrash(), { wrapper: createWrapper() });

    await waitFor(() => expect(dmsContentService.getTrash).toHaveBeenCalled());
  });

  it("narrows the trash to one kind when asked", async () => {
    vi.mocked(dmsContentService.getTrash).mockResolvedValue(page());

    renderHook(() => useDmsTrash({ type: "folder" }), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(dmsContentService.getTrash).toHaveBeenCalledWith(
        expect.objectContaining({ type: "folder" }),
      ),
    );
  });
});

describe("the reads that depend on a selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("useDmsFolder stays idle without a folder id", () => {
    renderHook(() => useDmsFolder(undefined), { wrapper: createWrapper() });

    expect(dmsFolderService.getFolder).not.toHaveBeenCalled();
  });

  it("useDmsFolder loads once an id is supplied", async () => {
    vi.mocked(dmsFolderService.getFolder).mockResolvedValue({} as never);

    renderHook(() => useDmsFolder("dir-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(dmsFolderService.getFolder).toHaveBeenCalledWith("dir-1"));
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

  it("creates a folder through the folder service", async () => {
    vi.mocked(dmsFolderService.createFolder).mockResolvedValue({ folderId: "new" });

    const { result } = renderHook(() => useCreateDmsFolder(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ name: "Reports", parentDirectoryId: "root" });

    expect(dmsFolderService.createFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Reports" }),
    );
  });

  it("updates a folder", async () => {
    vi.mocked(dmsFolderService.updateFolder).mockResolvedValue({ folderId: "dir-1" });

    const { result } = renderHook(() => useUpdateDmsFolder(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ folderId: "dir-1", name: "New" });

    expect(dmsFolderService.updateFolder).toHaveBeenCalledWith({ folderId: "dir-1", name: "New" });
  });

  it("moves a folder", async () => {
    vi.mocked(dmsFolderService.moveFolder).mockResolvedValue({ folderId: "dir-1" });

    const { result } = renderHook(() => useMoveDmsFolder(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ folderId: "dir-1", targetFolderId: "dir-2" });

    expect(dmsFolderService.moveFolder).toHaveBeenCalled();
  });

  it("deletes a folder", async () => {
    vi.mocked(dmsFolderService.deleteFolder).mockResolvedValue({ folderId: "dir-1" });

    const { result } = renderHook(() => useDeleteDmsFolder(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ folderId: "dir-1" });

    expect(dmsFolderService.deleteFolder).toHaveBeenCalledWith({ folderId: "dir-1" });
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

  it("shares content", async () => {
    vi.mocked(dmsContentService.shareContent).mockResolvedValue({ itemId: "policy-1" });

    const { result } = renderHook(() => useShareContent("res-1"), { wrapper: createWrapper() });
    await result.current.mutateAsync({
      resourceId: "res-1",
      principalType: "User",
      principalId: "user-2",
      permission: "View",
    });

    expect(dmsContentService.shareContent).toHaveBeenCalled();
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
    await result.current.mutateAsync({ fileId: "file-1", targetFolderId: "dir-2" });

    expect(dmsContentService.copyFile).toHaveBeenCalledWith("file-1", "dir-2", undefined);
  });

  it("moves a file", async () => {
    vi.mocked(dmsContentService.moveFile).mockResolvedValue({ fileId: "file-1" });

    const { result } = renderHook(() => useMoveFile(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ fileId: "file-1", targetFolderId: "dir-2" });

    expect(dmsContentService.moveFile).toHaveBeenCalledWith("file-1", "dir-2");
  });
});
