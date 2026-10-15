import { useQuery } from "@tanstack/react-query";
import { storageService } from "../services/storage.service";
import { useProjectStore } from "@seliseblocks/genesis-os";

const getProjectKey = () => useProjectStore.getState().selectedProject?.tenantId || "";

export const useGetStorageConfigurations = () => {
  const projectKey = getProjectKey();
  return useQuery({
    queryKey: ["storage", "configuration", "gets", projectKey],
    queryFn: () => storageService.configuration.gets(projectKey),
  });
};
