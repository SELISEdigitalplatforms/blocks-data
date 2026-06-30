import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storageService } from "../services/storage.service";
import { useProjectStore } from "@seliseblocks/blocks-kit";

const getProjectKey = () => useProjectStore.getState().selectedProject?.tenantId || "";

export const useGetStorageConfigurations = () => {
  const projectKey = getProjectKey();
  return useQuery({
    queryKey: ["storage", "configuration", "gets", projectKey],
    queryFn: () => storageService.configuration.gets(projectKey),
  });
};

export const useSaveStorageConfiguration = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();
  return useMutation({
    mutationKey: ["storage", "configuration", "save"],
    mutationFn: storageService.configuration.save,
    onSuccess: (data) => {
      if (data.isSuccess)
        queryClient.invalidateQueries({
          queryKey: ["storage", "configuration", "gets", projectKey],
        });
    },
  });
};
export const useDeleteStorageConfiguration = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();
  return useMutation({
    mutationKey: ["storage", "configuration", "delete"],
    mutationFn: storageService.configuration.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["storage", "configuration", "gets", projectKey],
      });
    },
  });
};
