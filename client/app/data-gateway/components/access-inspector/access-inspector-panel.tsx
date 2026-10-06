import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import {
  PERMISSION_ACTIONS,
  TAB_TO_ACCESS_LEVEL_KEY,
  TAB_TO_OPERATION,
} from "@/data-gateway/constants/schema-access-control";
import type { IField } from "@/data-gateway/models/data-service";
import { resolveFieldAccessLevel } from "@/data-gateway/utils/schema-access-control.utils";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { AccessTierDot } from "../primitives";
import {
  SchemaAccessControlView,
  type SchemaAccessControlViewHandle,
} from "../schema-access-control/schema-access-control-view";

/**
 * Imperative surface for a host that needs to check/act on unsaved changes
 * without seeing into which of the four verb tabs actually holds them (only
 * one is ever mounted-and-dirty in practice, but this asks whichever it is,
 * rather than assuming "view").
 *
 * `isDirty` is a function, not a snapshot boolean: each tab's own dirty state
 * lives in that tab's `SchemaAccessControlView`, and a change there doesn't
 * re-render this panel (React only re-renders the component whose state
 * changed). A plain boolean recomputed "every render" would then go stale
 * the moment a tab's staged rules change without *this* panel re-rendering
 * for an unrelated reason. Reading straight off each tab's ref instead, at
 * the moment a caller actually asks, is always current.
 */
export interface AccessInspectorPanelHandle {
  isDirty: () => boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}

export interface AccessInspectorPanelProps {
  fields?: IField[];
  schemaName: string;
  schemaId: string;
  level: "row" | "column";
  readAccessLevel?: number;
  writeAccessLevel?: number;
  editAccessLevel?: number;
  deleteAccessLevel?: number;
  fieldNames?: string[];
  selectedTab?: string;
  /** Fires when the rule editor opens or closes, so a host can widen for it. */
  onRuleEditorOpenChange?: (open: boolean) => void;
}

/**
 * Verb tabs plus the access editor for one subject.
 *
 * Shared by the docked inspector and the drawer that nested child tables still
 * use, so the two cannot drift.
 */
export const AccessInspectorPanel = forwardRef<
  AccessInspectorPanelHandle,
  AccessInspectorPanelProps
>(function AccessInspectorPanel(
  {
    fields = [],
    schemaName,
    schemaId,
    level,
    readAccessLevel,
    writeAccessLevel,
    editAccessLevel,
    deleteAccessLevel,
    fieldNames = [],
    selectedTab,
    onRuleEditorOpenChange,
  },
  ref,
) {
  const [activeTab, setActiveTab] = useState(selectedTab?.toLowerCase() ?? "view");
  // One ref per verb tab — all four stay mounted (just hidden) while any tab
  // is active, so these persist across tab switches.
  const tabRefs = useRef<Record<string, SchemaAccessControlViewHandle | null>>({});

  useImperativeHandle(ref, () => ({
    isDirty: () => Object.values(tabRefs.current).some((handle) => handle?.isDirty),
    save: async () => {
      for (const handle of Object.values(tabRefs.current)) {
        if (handle?.isDirty && !(await handle.save())) return false;
      }
      return true;
    },
    discard: () => {
      Object.values(tabRefs.current).forEach((handle) => handle?.discard());
    },
  }));

  // Opening the inspector from a different access pill should land on that
  // verb. Adjusted during render rather than in an effect, so the panel never
  // paints the old tab first.
  const [lastSelectedTab, setLastSelectedTab] = useState(selectedTab);
  if (selectedTab !== lastSelectedTab) {
    setLastSelectedTab(selectedTab);
    setActiveTab(selectedTab?.toLowerCase() ?? "view");
  }

  const schemaAccessLevels = {
    readAccessLevel,
    writeAccessLevel,
    editAccessLevel,
    deleteAccessLevel,
  };

  // Delete is not a thing you grant on a single column.
  const visibleActions =
    level === "column"
      ? PERMISSION_ACTIONS.filter((a) => a.value !== "delete")
      : PERMISSION_ACTIONS;

  const accessLevelForTab = (tabValue: string) =>
    level === "column"
      ? resolveFieldAccessLevel(fields, fieldNames, TAB_TO_ACCESS_LEVEL_KEY[tabValue])
      : schemaAccessLevels[TAB_TO_ACCESS_LEVEL_KEY[tabValue]];

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="shrink-0 border-b border-border/40 px-3">
        {/* Full width, split evenly — four verbs, not a packed row with dead
            space trailing off to the right. */}
        <TabsList className="flex h-12 w-full gap-0.5 bg-transparent p-0">
          {visibleActions.map((permission) => (
            <TabsTrigger
              key={permission.id}
              value={permission.value}
              className="flex h-12 flex-1 flex-col items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent px-2.5 py-2.5 text-xs text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <span>{permission.label}</span>
              <AccessTierDot level={accessLevelForTab(permission.value)} />
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {visibleActions.map((permission) => (
        <TabsContent
          key={permission.id}
          value={permission.value}
          className="mt-0 flex min-h-0 flex-1 flex-col px-3 py-3 data-[state=inactive]:hidden"
        >
          <SchemaAccessControlView
            ref={(handle) => {
              tabRefs.current[permission.value] = handle;
            }}
            schemaFields={fields}
            schemaName={schemaName}
            schemaId={schemaId}
            level={level}
            operation={TAB_TO_OPERATION[permission.value]}
            fieldNames={fieldNames}
            onRuleEditorOpenChange={onRuleEditorOpenChange}
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
  );
});
