"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui-kits/drawer/drawer";
import { Check, X } from "lucide-react";
import { ReactNode } from "react";
import {
  SchemaFieldValidationPanel,
  type SchemaFieldValidationPanelProps,
} from "./schema-field-validation-panel";

interface SchemaFieldValidationDrawerProps extends SchemaFieldValidationPanelProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The overlay form of the validations panel — mobile and nested child tables
 * have nowhere to dock a side panel, so they still get this, the same split
 * `SchemaAccessControlDrawer` uses for access. The top-level desktop table
 * docks `ValidationInspector` instead, beside the field list rather than
 * over it.
 */
export function SchemaFieldValidationDrawer({
  fieldName,
  schemaId,
  projectKey,
  initialValidationData,
  trigger,
  open,
  onOpenChange,
}: SchemaFieldValidationDrawerProps) {
  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={onOpenChange}
      handleOnly
    >
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent className="inset-y-0 left-auto right-0 mt-0 flex h-full w-full flex-col gap-0 rounded-none border-l border-border/40 bg-background p-0 transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right md:w-[480px] [&>div:first-child]:hidden">
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.05),transparent_55%)]" />

        {/* Header */}
        <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-6 py-4">
          <DrawerTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Check className="h-4 w-4 text-indigo-400" />
            Validations for{" "}
            <span className="font-mono text-indigo-400">{fieldName}</span>
          </DrawerTitle>
          <DrawerClose asChild>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close validation drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </DrawerClose>
        </div>

        <SchemaFieldValidationPanel
          fieldName={fieldName}
          schemaId={schemaId}
          projectKey={projectKey}
          initialValidationData={initialValidationData}
        />
      </DrawerContent>
    </Drawer>
  );
}
