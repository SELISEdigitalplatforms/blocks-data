import { http } from "@/lib/http-client";
import { CONTENT_ENDPOINTS, DMS_FILE_ENDPOINTS } from "../constants/endpoint.constant";
import {
  AccessPolicyDto,
  ContentSearchQuery,
  DmsChildrenResponse,
  DmsPermissionFlags,
  FileVersionsResponse,
  GrantAccessDto,
  ShareContentDto,
  TrashQuery,
} from "../models/dms.model";
import { toQuery } from "./dms-directory.service";

export class DmsContentService {
  search(query: ContentSearchQuery): Promise<DmsChildrenResponse> {
    return http.get(
      `${CONTENT_ENDPOINTS.SEARCH}${toQuery({
        query: query.query,
        directoryId: query.directoryId,
        type: query.type,
        cursor: query.cursor,
        limit: query.limit,
      })}`,
    );
  }

  getTrash(query: TrashQuery = {}): Promise<DmsChildrenResponse> {
    return http.get(
      `${CONTENT_ENDPOINTS.TRASH}${toQuery({
        type: query.type,
        cursor: query.cursor,
        limit: query.limit,
      })}`,
    );
  }

  restore(resourceId: string): Promise<{ resourceId: string }> {
    return http.post(CONTENT_ENDPOINTS.RESTORE, { resourceId });
  }

  deletePermanently(resourceId: string): Promise<{ resourceId: string }> {
    return http.post(CONTENT_ENDPOINTS.DELETE_PERMANENT, { resourceId });
  }

  getAccessPolicies(resourceId: string, includeInherited = true): Promise<AccessPolicyDto[]> {
    return http.get(`${CONTENT_ENDPOINTS.POLICIES}${toQuery({ resourceId, includeInherited })}`);
  }

  grantAccess(payload: GrantAccessDto): Promise<{ itemId: string }> {
    return http.post(CONTENT_ENDPOINTS.GRANT, payload);
  }

  updateAccessPolicy(payload: GrantAccessDto): Promise<{ itemId: string }> {
    return http.post(CONTENT_ENDPOINTS.UPDATE_POLICY, payload);
  }

  revokeAccessPolicy(resourceId: string, policyItemId: string): Promise<{ itemId: string }> {
    return http.post(CONTENT_ENDPOINTS.REVOKE, { resourceId, policyItemId });
  }

  resolveAccess(resourceId: string): Promise<DmsPermissionFlags> {
    return http.get(`${CONTENT_ENDPOINTS.RESOLVE}${toQuery({ resourceId })}`);
  }

  toggleInheritance(resourceId: string, inheritsParentAccess: boolean): Promise<{ itemId: string }> {
    return http.post(CONTENT_ENDPOINTS.INHERITANCE, { resourceId, inheritsParentAccess });
  }

  shareContent(payload: ShareContentDto): Promise<{ itemId: string }> {
    return http.post(CONTENT_ENDPOINTS.SHARE, payload);
  }

  getFileVersions(fileId: string, cursor?: string, limit?: number): Promise<FileVersionsResponse> {
    return http.get(`${DMS_FILE_ENDPOINTS.FILE_VERSIONS}${toQuery({ fileId, cursor, limit })}`);
  }

  createFileVersion(
    fileId: string,
    configurationName?: string,
  ): Promise<{ versionNo: number; uploadUrl: string }> {
    return http.post(DMS_FILE_ENDPOINTS.CREATE_FILE_VERSION, { fileId, configurationName });
  }

  copyFile(
    fileId: string,
    targetDirectoryId: string,
    copyAccessPolicies = false,
  ): Promise<{ fileId: string }> {
    return http.post(DMS_FILE_ENDPOINTS.COPY_FILE, { fileId, targetDirectoryId, copyAccessPolicies });
  }

  moveFile(fileId: string, targetDirectoryId: string): Promise<{ fileId: string }> {
    return http.post(DMS_FILE_ENDPOINTS.MOVE_FILE, { fileId, targetDirectoryId });
  }
}

export const dmsContentService = new DmsContentService();
