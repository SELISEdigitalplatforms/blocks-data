import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui-kits/drawer/drawer";
import { cn } from "@/lib/utils";
import { Shield, X } from "lucide-react";
import React, { ReactNode } from "react";
import { AccessInspectorPanel } from "./access-inspector";
import type { IField } from "@/data-gateway/models/data-service";

interface SchemaAccessControlDrawerProps {
  fields?: IField[];
  schemaName: string;
  schemaId: string;
  level: "row" | "column";
  readAccessLevel?: number;
  writeAccessLevel?: number;
  editAccessLevel?: number;
  deleteAccessLevel?: number;
  fieldNames?: string[];
  title?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectedTab?: string;
}

const SchemaAccessControlDrawer = ({
  fields = [],
  schemaName,
  schemaId,
  level,
  readAccessLevel,
  writeAccessLevel,
  editAccessLevel,
  deleteAccessLevel,
  fieldNames = [],
  title = "Schema Access Control",
  trigger,
  open,
  onOpenChange,
  selectedTab,
}: SchemaAccessControlDrawerProps) => {
  const handleCloseAutoFocus = (event: Event) => {
    // In controlled mode, avoid restoring focus to hidden/virtual triggers.
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange} handleOnly>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}

      <DrawerContent
        onCloseAutoFocus={handleCloseAutoFocus}
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l border-border/40 bg-background md:w-[480px] [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        )}
        style={{ userSelect: "text" }}
      >
        <div className="relative flex h-full flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.05),transparent_55%)]" />
          {/* Header */}
          <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-6 py-4">
            <DrawerTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Shield className="h-4 w-4 text-indigo-400" />
              {title}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Configure access rules for this schema.
            </DrawerDescription>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close schema access drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>

          <AccessInspectorPanel
            fields={fields}
            schemaName={schemaName}
            schemaId={schemaId}
            level={level}
            readAccessLevel={readAccessLevel}
            writeAccessLevel={writeAccessLevel}
            editAccessLevel={editAccessLevel}
            deleteAccessLevel={deleteAccessLevel}
            fieldNames={fieldNames}
            selectedTab={selectedTab}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default SchemaAccessControlDrawer;
