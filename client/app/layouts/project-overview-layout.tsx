import { DashboardLayoutProvider } from "@/contexts/dashboard-layout-provider";
import { DashboardHeader } from "./dashboard-header/dashboard-header";
import { SidebarMenuDesktop } from "./sidebar-menu-desktop/sidebar-menu-desktop";
import { useProjectStore, EnvironmentCard } from "@seliseblocks/blocks-kit";

export function ProjectOverviewLayout() {
  let { projects } = useProjectStore();
  return (
    // <ProtectedGuard>
    //   <ImpersonationChecker>
    //     <ImpersonationTerminator>
    <DashboardLayoutProvider isOpen={true} persist>
      <div className="relative flex h-screen overflow-hidden bg-[hsl(var(--surface-app))]">
        <SidebarMenuDesktop />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <DashboardHeader />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {/* <Outlet /> */}
            {projects.map((project) => (
              <EnvironmentCard project={project} />
            ))}
          </main>
        </div>
      </div>
    </DashboardLayoutProvider>
    //     </ImpersonationTerminator>
    //   </ImpersonationChecker>
    // </ProtectedGuard>
  );
}
