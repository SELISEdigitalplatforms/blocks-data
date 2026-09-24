import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import {
  PERMISSION_ACTIONS,
  TAB_TO_ACCESS_LEVEL_KEY,
  TAB_TO_OPERATION,
} from "@/data-gateway/constants/schema-access-control";
import type { IField } from "@/data-gateway/models/data-service";
import { resolveFieldAccessLevel } from "@/data-gateway/utils/schema-access-control.utils";
import { useState } from "react";

import { AccessTierDot } from "../primitives";
import { SchemaAccessControlView } from "../schema-access-control/schema-access-control-view";

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
export function AccessInspectorPanel({
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
}: AccessInspectorPanelProps) {
  const [activeTab, setActiveTab] = useState(selectedTab?.toLowerCase() ?? "view");

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
        <TabsList className="flex h-9 w-full gap-0.5 bg-transparent p-0">
          {visibleActions.map((permission) => (
            <TabsTrigger
              key={permission.id}
              value={permission.value}
              className="flex h-9 flex-1 flex-col items-center gap-1 rounded-none border-b-2 border-transparent px-2.5 pt-1.5 text-xs text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
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
}
