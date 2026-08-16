import { http } from "@/lib/http-client";
import { FOLDER_ENDPOINTS, OBJECT_ENDPOINTS } from "../constants/endpoint.constant";
import {
  CreateDirectoryDto,
  DeleteDirectoryDto,
  DmsChildrenQuery,
  DmsChildrenResponse,
  DmsDirectoryDetail,
  MoveDirectoryDto,
  UpdateDirectoryDto,
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

export class DmsDirectoryService {
  getDirectory(directoryId: string): Promise<DmsDirectoryDetail> {
    return http.get(`${FOLDER_ENDPOINTS.GET}${toQuery({ directoryId })}`);
  }

  getChildren(query: DmsChildrenQuery): Promise<DmsChildrenResponse> {
    return http.get(
      `${OBJECT_ENDPOINTS.CHILDREN}${toQuery({
        parentDirectoryId: query.directoryId,
        cursor: query.cursor,
        limit: query.limit,
        type: query.type,
        search: query.search,
      })}`,
    );
  }

  /**
   * Creates a directory. A directory with no parent starts a new tree, which is a
   * separate endpoint because it carries a separate permission; routing on the
   * payload here keeps that split invisible to callers.
   */
  createDirectory(payload: CreateDirectoryDto): Promise<{ directoryId: string }> {
    const endpoint = payload.parentDirectoryId ? FOLDER_ENDPOINTS.CREATE : FOLDER_ENDPOINTS.CREATE_ROOT;

    return http.post(endpoint, {
      name: payload.name,
      parentDirectoryId: payload.parentDirectoryId,
      description: payload.description,
      configurationName: payload.configurationName,
      moduleName: payload.moduleName,
      allowedFileExtensions: payload.allowedFileExtensions,
    });
  }

  updateDirectory(payload: UpdateDirectoryDto): Promise<{ directoryId: string }> {
    return http.post(FOLDER_ENDPOINTS.UPDATE, payload);
  }

  moveDirectory(payload: MoveDirectoryDto): Promise<{ directoryId: string }> {
    return http.post(FOLDER_ENDPOINTS.MOVE, payload);
  }

  deleteDirectory(payload: DeleteDirectoryDto): Promise<{ directoryId: string }> {
    return http.post(FOLDER_ENDPOINTS.DELETE, {
      directoryId: payload.directoryId,
      permanent: payload.permanent ?? true,
    });
  }
}

export const dmsDirectoryService = new DmsDirectoryService();
