"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { BookOpen, Download, FolderInput, MoreVertical, Settings } from "lucide-react";
import { ReactNode, useState } from "react";

import ExportSchemaModal from "../export-schema/export-schema-modal";
import ImportSchemaModal from "../import-schema-modal";

type Utility = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

/**
 * The things you do *to* the gateway rather than places you go: docs, moving
 * schemas in and out, and configuring the data source.
 *
 * Navigation left this component in the revamp — Playground and Analytics were
 * buttons here and are section tabs now, so a destination has exactly one home.
 */
export const DataGatewayUtilities = () => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalInstance, setImportModalInstance] = useState(0);

  const utilities: Utility[] = [
    {
      label: "API Docs",
      icon: <BookOpen className="h-4 w-4" />,
      onClick: () =>
        window.open(`${getRuntimeEnv("BLOCKS_DATA_BASE_URL")}/swagger/index.html`, "_blank"),
    },
    {
      label: "Import",
      icon: <FolderInput className="h-4 w-4" />,
      onClick: () => {
        // Remount the modal so a second import starts from a clean form.
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
      label: "Configure",
      icon: <Settings className="h-4 w-4" />,
      // The in-app configuration page is gone; the data source is managed in
      // Blocks OS secret management, which opens in its own tab.
      onClick: () =>
        window.open(
          `${getRuntimeEnv("BLOCKS_OS_BASE_URL")}/app/secret-management/data-gateway`,
          "_blank",
        ),
    },
  ];

  return (
    <>
      {/* Narrow screens: one menu, so the bar keeps room for the title. */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border/50 text-muted-foreground"
              aria-label="Utilities"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {utilities.map(({ label, icon, onClick }) => (
              <DropdownMenuItem
                key={label}
                className="cursor-pointer gap-2"
                onClick={onClick}
              >
                {icon} {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="hidden items-center gap-1 md:flex">
        {utilities.map(({ label, icon, onClick }) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            title={label}
            onClick={onClick}
            className="h-8 w-8 border-border/50 text-muted-foreground hover:text-foreground"
          >
            {icon}
          </Button>
        ))}
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
