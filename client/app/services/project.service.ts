import { http } from "@/lib/http-client";
import { IDP_BASE_URL } from "@/constants/endpoint.constant";
import { PROJECT_ENDPOINTS } from "@/identifier/constants/endpoint.constant";
import { IGetProjectPayload, IGetProjectResponse, IProjectGroup } from "@/models/project.model";

export class ProjectService {
  getProjects(page = 0, pageSize = 100, tenantGroupId = ""): Promise<IProjectGroup[]> {
    const url = `${PROJECT_ENDPOINTS.GETS}?page=${page}&pageSize=${pageSize}&tenantGroupId=${tenantGroupId}`;
    return http.get(url, undefined, { absoluteUrl: true });
  }

  getProject(payload: IGetProjectPayload): Promise<IGetProjectResponse> {
    const url = `${IDP_BASE_URL}${PROJECT_ENDPOINTS.GET}?projectId=${payload.projectId}`;
    return http.get(url, undefined, { absoluteUrl: true });
  }
}

export const projectService = new ProjectService();