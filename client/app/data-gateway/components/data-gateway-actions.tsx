"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useDataGatewayPath } from "@/hooks/use-scoped-path";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { cn } from "@/lib/utils";
import { BarChart3, BookOpen, Download, FolderInput, MoreVertical, Settings } from "lucide-react";
import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import ExportSchemaModal from "./export-schema/export-schema-modal";
import ImportSchemaModal from "./import-schema-modal";

const GraphQLIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 30 30" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.08 22.864l-1.1-.636L15 .345l1.1.636zm-1.1 4.636L14.636 29.66l.636-1.1L3.616 26.4zm13.12 0L27.746 29.1l.636 1.1L16.736 28.4zm4.636-4.636l1.1.636L29.46 6.636 28.36 6zm-5.82-20.03l-.636-1.1L1.1 7.924l.636 1.1zM.5 9.636l-.636 1.1 11.63 6.72.636-1.1zm27.364 7.82l.636-1.1L16.87 9.636l-.636 1.1zm-13.82 6.1l1.274.012.012-13.82-1.274-.012z"/>
    <circle cx="15" cy="1.833" r="2.5"/>
    <circle cx="28.667" cy="9.5" r="2.5"/>
    <circle cx="28.667" cy="20.5" r="2.5"/>
    <circle cx="15" cy="28.167" r="2.5"/>
    <circle cx="1.333" cy="20.5" r="2.5"/>
    <circle cx="1.333" cy="9.5" r="2.5"/>
  </svg>
);

export interface DataGatewayAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}

const inlineButtonClass = "gap-2 px-4 border-border/40 transition-colors";

export const DataGatewayActions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const dataGatewayPath = useDataGatewayPath();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalInstance, setImportModalInstance] = useState(0);

  const isPlayground = location.pathname.includes("/playground");
  const isConfigure = location.pathname.includes("/configuration");
  const isAnalytics = location.pathname.includes("/analytics");

  // The two actions that stay buttons on desktop — API Docs opens the Swagger UI in a new tab, and
  // Playground is the action people reach for most.
  const INLINE_ACTIONS: DataGatewayAction[] = [
    {
      label: "API Docs",
      icon: <BookOpen className="h-4 w-4" />,
      onClick: () =>
        window.open(
          `${getRuntimeEnv("BLOCKS_DATA_BASE_URL")}/swagger/index.html`,
          "_blank",
        ),
    },
    {
      label: "Playground",
      icon: <GraphQLIcon className="h-4 w-4" />,
      onClick: () => navigate(`${dataGatewayPath}/playground`),
      active: isPlayground,
    },
  ];

  // Everything else lives behind the overflow menu, on every screen size.
  const OVERFLOW_ACTIONS: DataGatewayAction[] = [
    {
      label: "Import",
      icon: <FolderInput className="h-4 w-4" />,
      onClick: () => {
        setImportModalInstance((n) => n + 1);
        setIsImportModalOpen(true);
      },
    },
    {
      label: "Export",
      icon: <Download className="h-4 w-4" />,
      onClick: () => setIsExportModalOpen(true),
    },
    {
      label: "Analytics",
      icon: <BarChart3 className="h-4 w-4" />,
      onClick: () => navigate(`${dataGatewayPath}/analytics`),
      active: isAnalytics,
    },
    {
      label: "Configure",
      icon: <Settings className="h-4 w-4" />,
      onClick: () => navigate(`${dataGatewayPath}/configuration`),
      active: isConfigure,
    },
  ];

  const mobileMenuActions = [...INLINE_ACTIONS, ...OVERFLOW_ACTIONS];

  const renderMenuItems = (actions: DataGatewayAction[]) =>
    actions.map(({ label, icon, onClick, active }) => (
      <DropdownMenuItem
        key={label}
        className={cn("cursor-pointer gap-2", active && "text-primary")}
        onClick={onClick}
      >
        {icon} {label}
      </DropdownMenuItem>
    ));

  const menuTrigger = (label: string) => (
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 border-border/40 text-muted-foreground/70 hover:border-border/60 hover:text-foreground"
        aria-label={label}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
  );

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {/* Mobile: every action collapsed into one menu */}
        <div className="xl:hidden">
          <DropdownMenu>
            {menuTrigger("Actions")}
            <DropdownMenuContent align="end" className="w-48">
              {renderMenuItems(mobileMenuActions)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Desktop: inline buttons plus an overflow menu for the rest */}
        <div className="hidden items-center gap-2 xl:flex">
          {INLINE_ACTIONS.map(({ label, icon, onClick, active }) => (
            <Button
              key={label}
              size="sm"
              variant="outline"
              className={cn(
                inlineButtonClass,
                active
                  ? "border-primary/40 bg-primary/5 text-primary shadow-[0_0_12px_-2px_rgba(99,102,241,0.2)]"
                  : "text-muted-foreground/70 hover:border-border/60 hover:text-foreground",
              )}
              onClick={onClick}
            >
              {icon}
              {label}
            </Button>
          ))}

          <DropdownMenu>
            {menuTrigger("More actions")}
            <DropdownMenuContent align="end" className="w-48">
              {renderMenuItems(OVERFLOW_ACTIONS)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <ExportSchemaModal onClose={() => setIsExportModalOpen(false)} />
      </Dialog>

      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        {isImportModalOpen && (
          <ImportSchemaModal
            key={importModalInstance}
            projectKey={projectKey}
            onClose={() => setIsImportModalOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
};
