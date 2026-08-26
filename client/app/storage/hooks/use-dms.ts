import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { dmsContentService } from "../services/dms-content.service";
import { dmsDirectoryService } from "../services/dms-directory.service";
import { iamPrincipalService } from "../services/iam-principal.service";
import {
  ObjectSearchQuery,
  CreateDirectoryDto,
  DeleteDirectoryDto,
  DmsChildrenResponse,
  DmsItemType,
  GrantAccessDto,
  MoveDirectoryDto,
  ShareObjectDto,
  TrashQuery,
  UpdateDirectoryDto,
} from "../models/dms.model";

const getProjectKey = () => useProjectStore.getState().selectedProject?.tenantId || "";

/**
 * Every listing mutation invalidates this prefix rather than an exact key, so a
 * create or delete refreshes the directory regardless of the filters in effect when
 * it happened.
 */
export const dmsChildrenKey = (projectKey: string) => ["dms", "children", projectKey];

export const dmsTrashKey = (projectKey: string) => ["dms", "trash", projectKey];

export const dmsPoliciesKey = (projectKey: string, resourceId: string) => [
  "dms",
  "policies",
  projectKey,
  resourceId,
];

/** Follows `nextCursor` until the server stops offering one. */
const nextCursor = (last: DmsChildrenResponse) => (last.hasMore ? last.nextCursor : undefined);

export const useDmsChildren = (
  directoryId: string | undefined,
  options: { type?: DmsItemType; search?: string; limit?: number } = {},
) => {
  const projectKey = getProjectKey();

  return useInfiniteQuery({
    queryKey: [...dmsChildrenKey(projectKey), directoryId, options.type, options.search],
    queryFn: ({ pageParam }) =>
      dmsDirectoryService.getChildren({
        directoryId: directoryId,
        cursor: pageParam as string | undefined,
        limit: options.limit ?? 50,
        type: options.type,
        search: options.search,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    // An unset directory id targets the root listing, which is what the storage page shows
    // before any directory has been opened. Disable only when the caller is unscoped, not
    // just because a directory id is missing.
    enabled: !!projectKey,
  });
};

export const useDmsDirectory = (directoryId: string | undefined) => {
  const projectKey = getProjectKey();

  return useQuery({
    queryKey: ["dms", "directory", projectKey, directoryId],
    queryFn: () => dmsDirectoryService.getDirectory(directoryId as string),
    enabled: !!directoryId,
  });
};

export const useDmsSearch = (query: ObjectSearchQuery) => {
  const projectKey = getProjectKey();

  return useInfiniteQuery({
    queryKey: ["dms", "search", projectKey, query.query, query.directoryId, query.type],
    queryFn: ({ pageParam }) =>
      dmsContentService.search({ ...query, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: !!query.query?.trim(),
  });
};

export const useDmsTrash = (query: TrashQuery = {}) => {
  const projectKey = getProjectKey();

  return useInfiniteQuery({
    queryKey: [...dmsTrashKey(projectKey), query.type],
    queryFn: ({ pageParam }) =>
      dmsContentService.getTrash({ ...query, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });
};

export const useCreateDmsDirectory = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "directory", "create"],
    mutationFn: (payload: CreateDirectoryDto) => dmsDirectoryService.createDirectory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useUpdateDmsDirectory = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "directory", "update"],
    mutationFn: (payload: UpdateDirectoryDto) => dmsDirectoryService.updateDirectory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useMoveDmsDirectory = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "directory", "move"],
    mutationFn: (payload: MoveDirectoryDto) => dmsDirectoryService.moveDirectory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useDeleteDmsDirectory = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "directory", "delete"],
    mutationFn: (payload: DeleteDirectoryDto) => dmsDirectoryService.deleteDirectory(payload),
    onSuccess: () => {
      // A soft delete moves the item into the trash, so both listings are stale.
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
      queryClient.invalidateQueries({ queryKey: dmsTrashKey(projectKey) });
    },
  });
};

export const useRestoreFromTrash = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "trash", "restore"],
    mutationFn: (resourceId: string) => dmsContentService.restore(resourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsTrashKey(projectKey) });
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useDeleteFromTrash = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "trash", "deletePermanent"],
    mutationFn: (resourceId: string) => dmsContentService.deletePermanently(resourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsTrashKey(projectKey) });
    },
  });
};

export const useAccessPolicies = (resourceId: string | undefined, includeInherited = true) => {
  const projectKey = getProjectKey();

  return useQuery({
    queryKey: [...dmsPoliciesKey(projectKey, resourceId ?? ""), includeInherited],
    queryFn: () => dmsContentService.getAccessPolicies(resourceId as string, includeInherited),
    enabled: !!resourceId,
  });
};

export const useGrantAccess = (resourceId: string) => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "access", "grant"],
    mutationFn: (payload: GrantAccessDto) => dmsContentService.grantAccess(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsPoliciesKey(projectKey, resourceId) });
      // A new grant can change what the listing shows, so it is refreshed too.
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useRevokeAccess = (resourceId: string) => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "access", "revoke"],
    mutationFn: (policyItemId: string) =>
      dmsContentService.revokeAccessPolicy(resourceId, policyItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsPoliciesKey(projectKey, resourceId) });
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useShareObject = (resourceId: string) => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "access", "share"],
    mutationFn: (payload: ShareObjectDto) => dmsContentService.shareObject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsPoliciesKey(projectKey, resourceId) });
    },
  });
};

export const useToggleInheritance = (resourceId: string) => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "access", "inheritance"],
    mutationFn: (inherits: boolean) => dmsContentService.toggleInheritance(resourceId, inherits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsPoliciesKey(projectKey, resourceId) });
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useFileVersions = (fileId: string | undefined) => {
  const projectKey = getProjectKey();

  return useInfiniteQuery({
    queryKey: ["dms", "versions", projectKey, fileId],
    queryFn: ({ pageParam }) =>
      dmsContentService.getFileVersions(fileId as string, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: !!fileId,
  });
};

export const useCopyFile = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "file", "copy"],
    mutationFn: (payload: { fileId: string; targetDirectoryId: string; copyAccessPolicies?: boolean }) =>
      dmsContentService.copyFile(payload.fileId, payload.targetDirectoryId, payload.copyAccessPolicies),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

export const useMoveFile = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["dms", "file", "move"],
    mutationFn: (payload: { fileId: string; targetDirectoryId: string }) =>
      dmsContentService.moveFile(payload.fileId, payload.targetDirectoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dmsChildrenKey(projectKey) });
    },
  });
};

// ---- IAM principal pickers (back the manage-access dialog) ----
//
// Each query is keyed by the search term so typing re-queries the IAM service.
// `enabled` lets the dialog mount a single hook and only fire when the relevant
// principal type is picked — otherwise the unused two stay dormant.

export const iamPrincipalKey = (
  projectKey: string,
  kind: "users" | "roles" | "organizations",
  search: string,
) => ["dms", "iam-principals", projectKey, kind, search];

export const useIamUsers = (search: string, enabled: boolean) => {
  const projectKey = getProjectKey();

  return useQuery({
    queryKey: iamPrincipalKey(projectKey, "users", search),
    queryFn: () => iamPrincipalService.getUsers(search),
    enabled,
  });
};

export const useIamRoles = (search: string, enabled: boolean) => {
  const projectKey = getProjectKey();

  return useQuery({
    queryKey: iamPrincipalKey(projectKey, "roles", search),
    queryFn: () => iamPrincipalService.getRoles(search),
    enabled,
  });
};

export const useIamOrganizations = (search: string, enabled: boolean) => {
  const projectKey = getProjectKey();

  return useQuery({
    queryKey: iamPrincipalKey(projectKey, "organizations", search),
    queryFn: () => iamPrincipalService.getOrganizations(search),
    enabled,
  });
};
