import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui-kits/drawer/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { cn } from "@/lib/utils";
import {
  PERMISSION_ACTIONS,
  TAB_TO_OPERATION,
  TAB_TO_ACCESS_LEVEL_KEY,
} from "@/data-gateway/constants/schema-access-control";
import { resolveFieldAccessLevel } from "@/data-gateway/utils/schema-access-control.utils";
import { X } from "lucide-react";
import React, { ReactNode, useEffect, useState } from "react";
import { SchemaAccessControlView } from "./schema-access-control/schema-access-control-view";
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

  const schemaAccessLevels = {
    readAccessLevel,
    writeAccessLevel,
    editAccessLevel,
    deleteAccessLevel,
  };

  const [activeTab, setActiveTab] = useState("view");

  useEffect(() => {
    if (selectedTab) {
      setActiveTab(selectedTab.toLowerCase());
    } else {
      setActiveTab("view");
    }
  }, [selectedTab]);

  // Delete tab is not applicable for property (column) level access management
  const visibleActions =
    level === "column"
      ? PERMISSION_ACTIONS.filter((a) => a.value !== "delete")
      : PERMISSION_ACTIONS;

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange} handleOnly>
      {trigger ? (
        <DrawerTrigger onClick={() => setActiveTab("view")} asChild>
          {trigger}
        </DrawerTrigger>
      ) : null}

      <DrawerContent
        onCloseAutoFocus={handleCloseAutoFocus}
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l bg-background p-6 md:w-[85vw] md:max-w-6xl [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        )}
        style={{ userSelect: "text" }}
      >
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between gap-4">
            <DrawerTitle className="min-w-0 flex-1 pr-2 text-lg font-semibold leading-snug tracking-tight">
              {title}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Configure access rules for this schema.
            </DrawerDescription>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                aria-label="Close schema access drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="mt-6 flex flex-1 flex-col"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <TabsList className="order-2 w-full justify-start bg-muted/60 p-1 md:order-1 md:max-w-xs">
                {visibleActions.map((permission) => (
                  <TabsTrigger key={permission.id} value={permission.value} className="flex-1">
                    {permission.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {visibleActions.map((permission) => (
              <TabsContent key={permission.id} value={permission.value}>
                <SchemaAccessControlView
                  schemaFields={fields}
                  schemaName={schemaName}
                  schemaId={schemaId}
                  level={level}
                  operation={TAB_TO_OPERATION[permission.value]}
                  fieldNames={fieldNames}
                  defaultAccessLevel={
                    level === "column"
                      ? resolveFieldAccessLevel(
                        fields,
                        fieldNames,
                        TAB_TO_ACCESS_LEVEL_KEY[permission.value],
                      )
                      : schemaAccessLevels[TAB_TO_ACCESS_LEVEL_KEY[permission.value]]
                  }
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default SchemaAccessControlDrawer;
