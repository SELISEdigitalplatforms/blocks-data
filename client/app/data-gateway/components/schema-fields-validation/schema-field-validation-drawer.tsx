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
import { FieldSubject } from "../primitives";
import {
  SchemaFieldValidationPanel,
  type SchemaFieldValidationPanelProps,
} from "./schema-field-validation-panel";

interface SchemaFieldValidationDrawerProps extends SchemaFieldValidationPanelProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The schema the property belongs to, for the header's second line. */
  schemaName?: string;
}

/**
 * The overlay form of the validations panel — mobile and nested child tables
 * have nowhere to dock a side panel, so they still get this, the same split
 * `SchemaAccessControlDrawer` uses for access. The top-level desktop table
 * docks `ValidationInspector` instead, beside the field list rather than
 * over it. The header reads like the inspector's: the panel's name, then the
 * property (name, type, schema).
 */
export function SchemaFieldValidationDrawer({
  fieldName,
  schemaId,
  projectKey,
  initialValidationData,
  fieldType,
  enumValues,
  isArray,
  schemaName,
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
        <div className="relative flex shrink-0 items-start gap-3 border-b border-primary/20 bg-primary/10 px-5 py-3.5">
          <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DrawerTitle className="text-sm font-semibold text-foreground">Validations</DrawerTitle>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <FieldSubject name={fieldName} type={fieldType} isArray={isArray} schemaName={schemaName} />
            </div>
          </div>
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
          fieldType={fieldType}
          enumValues={enumValues}
          isArray={isArray}
        />
      </DrawerContent>
    </Drawer>
  );
}
