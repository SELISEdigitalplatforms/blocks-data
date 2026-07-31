import { http } from "@/lib/http-client";
import { FOLDER_ENDPOINTS } from "../constants/endpoint.constant";
import {
  CreateFolderDto,
  DeleteFolderDto,
  DmsChildrenQuery,
  DmsChildrenResponse,
  DmsFolderDetail,
  MoveFolderDto,
  UpdateFolderDto,
} from "../models/dms.model";

/**
 * Builds a query string, dropping anything unset so an omitted filter does not
 * arrive as the literal "undefined".
 */
export function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.append(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `?${query}` : "";
}

export class DmsFolderService {
  getFolder(folderId: string): Promise<DmsFolderDetail> {
    return http.get(`${FOLDER_ENDPOINTS.GET}${toQuery({ folderId })}`);
  }

  getChildren(query: DmsChildrenQuery): Promise<DmsChildrenResponse> {
    return http.get(
      `${FOLDER_ENDPOINTS.CHILDREN}${toQuery({
        folderId: query.folderId,
        cursor: query.cursor,
        limit: query.limit,
        type: query.type,
        search: query.search,
      })}`,
    );
  }

  /**
   * Creates a folder. A folder with no parent starts a new tree, which is a
   * separate endpoint because it carries a separate permission; routing on the
   * payload here keeps that split invisible to callers.
   */
  createFolder(payload: CreateFolderDto): Promise<{ folderId: string }> {
    const endpoint = payload.parentDirectoryId ? FOLDER_ENDPOINTS.CREATE : FOLDER_ENDPOINTS.CREATE_ROOT;

    return http.post(endpoint, {
      name: payload.name,
      parentFolderId: payload.parentDirectoryId,
      description: payload.description,
      configurationName: payload.configurationName,
      moduleName: payload.moduleName,
      allowedFileExtensions: payload.allowedFileExtensions,
    });
  }

  updateFolder(payload: UpdateFolderDto): Promise<{ folderId: string }> {
    return http.post(FOLDER_ENDPOINTS.UPDATE, payload);
  }

  moveFolder(payload: MoveFolderDto): Promise<{ folderId: string }> {
    return http.post(FOLDER_ENDPOINTS.MOVE, payload);
  }

  deleteFolder(payload: DeleteFolderDto): Promise<{ folderId: string }> {
    return http.post(FOLDER_ENDPOINTS.DELETE, {
      folderId: payload.folderId,
      permanent: payload.permanent ?? false,
    });
  }
}

export const dmsFolderService = new DmsFolderService();
