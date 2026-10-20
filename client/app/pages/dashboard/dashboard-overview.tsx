import { ProjectDetail } from "@/components/project-detail/project-detail";
import { useGetProject, useValidateCNameProject } from "@/hooks/use-project";
import { showErrorToast } from "@/hooks/use-toast";
import { getDomain } from "@/lib/domain";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useCallback, useEffect } from "react";

export const DashboardOverview = () => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { itemId } = useProjectStore().selectedProject || {
    itemId: "",
    tenantId: "",
  };
  const { data, isLoading } = useGetProject({ projectId: itemId });
  const { mutateAsync } = useValidateCNameProject({ projectKey });
  const applications = data?.data?.applications;
  const customDomain = data?.data?.customDomain;

  const cNameValidator = useCallback(async () => {
    try {
      const applicationDomain = applications?.[0]?.domain;
      if (
        !applicationDomain ||
        getDomain(applicationDomain) === "seliseblocks.com"
      )
        return;

      if (!customDomain) return;

      await mutateAsync({
        projectKey: projectKey,
        cookieDomain: new URL(customDomain).hostname,
      });
    } catch (error) {
      if (error && typeof error === "object" && "errors" in error) {
        showErrorToast({ errors: (error as { errors?: unknown }).errors });
      }
    }
  }, [applications, customDomain, mutateAsync, projectKey]);

  useEffect(() => {
    cNameValidator();
  }, [cNameValidator]);

  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold md:text-2xl">
          Environment Overview
        </h1>
      </div>
      <ProjectDetail project={data?.data} isLoading={isLoading} />
    </main>
  );
};
