import { DashboardLayoutProvider } from "@/contexts/dashboard-layout-provider";
import {
  ImpersonationChecker,
  ImpersonationSynchronizer,
  ProtectedGuard,
} from "@/guards/protected-guard";
import { useGetProject } from "@/hooks/use-project";
import { DashboardHeader } from "@/layouts/dashboard-header/dashboard-header";
import { SidebarMenuDesktop } from "@/layouts/sidebar-menu-desktop/sidebar-menu-desktop";
import { useProjectStore } from "@/store/useProjectStore";
import { useEffect } from "react";
import { Outlet } from "react-router-dom";

function ProjectHydrator() {
  const { selectedProject, setSelectedProject } = useProjectStore();
  const { data: projectData } = useGetProject({
    projectId: selectedProject?.itemId || "",
  });

  useEffect(() => {
    if (
      projectData?.data &&
      selectedProject?.itemId === projectData.data.itemId
    ) {
      setSelectedProject(projectData.data);
    }
  }, [projectData, selectedProject?.itemId, setSelectedProject]);

  return null;
}

export function DashboardLayout() {
  return (
    <ProtectedGuard>
      <ImpersonationChecker>
        <ImpersonationSynchronizer>
          <DashboardLayoutProvider isOpen={true} persist>
            <ProjectHydrator />
            <div className="relative flex h-screen bg-[hsl(var(--surface-app))]">
              <SidebarMenuDesktop />
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <DashboardHeader />
                <main className="flex-1 overflow-y-auto overflow-x-hidden">
                  <Outlet />
                </main>
              </div>
            </div>
          </DashboardLayoutProvider>
        </ImpersonationSynchronizer>
      </ImpersonationChecker>
    </ProtectedGuard>
  );
}
