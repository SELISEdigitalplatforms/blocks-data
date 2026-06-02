import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { impersonationService } from "../services/impersonation.service";

export const IMPERSONATION_STATUS_QUERY_KEY = [
  "impersonation",
  "status",
] as const;

export const useStartImpersonation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["impersonation", "start"],
    mutationFn: impersonationService.startImpersonation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: IMPERSONATION_STATUS_QUERY_KEY,
      });
    },
  });
};

export const useStopImpersonation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["impersonation", "stop"],
    mutationFn: impersonationService.stopImpersonation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: IMPERSONATION_STATUS_QUERY_KEY,
      });
    },
  });
};

export const useImpersonationStatusChecker = () => {
  return useQuery({
    queryKey: IMPERSONATION_STATUS_QUERY_KEY,
    queryFn: () => impersonationService.impersonationStatus(),
    staleTime: 0,
  });
};
