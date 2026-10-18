"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui-kits/drawer/drawer";
import { TextCursorInput, X } from "lucide-react";
import { DefaultValuePanel, type DefaultValuePanelProps } from "./default-value-panel";

interface DefaultValueDrawerProps extends DefaultValuePanelProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The overlay form of the default-value panel, for mobile and nested child
 * tables — the same split `SchemaFieldValidationDrawer` makes for validations.
 */
export function DefaultValueDrawer({ open, onOpenChange, ...panelProps }: DefaultValueDrawerProps) {
  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange} handleOnly>
      <DrawerContent className="inset-y-0 left-auto right-0 mt-0 flex h-full w-full flex-col gap-0 rounded-none border-l border-border/40 bg-background p-0 transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right md:w-[480px] [&>div:first-child]:hidden">
        <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-6 py-4">
          <DrawerTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TextCursorInput className="h-4 w-4 text-indigo-400" />
            Default value for <span className="font-mono text-indigo-400">{panelProps.fieldName}</span>
          </DrawerTitle>
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
