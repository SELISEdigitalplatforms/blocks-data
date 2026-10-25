"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui-kits/drawer/drawer";
import { RectangleEllipsis, X } from "lucide-react";
import { FieldSubject } from "../primitives";
import { DefaultValuePanel, type DefaultValuePanelProps } from "./default-value-panel";

interface DefaultValueDrawerProps extends DefaultValuePanelProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The schema the property belongs to, for the header's second line. */
  schemaName?: string;
}

/**
 * The overlay form of the default-value panel, for mobile and nested child
 * tables — the same split `SchemaFieldValidationDrawer` makes for validations.
 * Its header reads like the docked inspector's: the panel's name, then the
 * property (name, type, schema).
 */
export function DefaultValueDrawer({ open, onOpenChange, schemaName, ...panelProps }: Readonly<DefaultValueDrawerProps>) {
  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange} handleOnly>
      <DrawerContent className="inset-y-0 left-auto right-0 mt-0 flex h-full w-full flex-col gap-0 rounded-none border-l border-border/40 bg-background p-0 transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right md:w-[480px] [&>div:first-child]:hidden">
        <div className="relative flex shrink-0 items-start gap-3 border-b border-primary/20 bg-primary/10 px-5 py-3.5">
          <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <RectangleEllipsis className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DrawerTitle className="text-sm font-semibold text-foreground">Default value</DrawerTitle>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <FieldSubject name={panelProps.fieldName} type={panelProps.fieldType} isArray={panelProps.isArray} schemaName={schemaName} />
            </div>
          </div>
          <DrawerClose asChild>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close default value drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </DrawerClose>
        </div>

        <DefaultValuePanel {...panelProps} />
      </DrawerContent>
    </Drawer>
  );
}
