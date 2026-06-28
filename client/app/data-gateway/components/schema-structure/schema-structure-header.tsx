import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { ChevronDown, Copy, MoreVertical, Trash } from "lucide-react";
// import { SchemaClsToggle } from "../schema-cls-toggle";
import { SchemaPreviewDrawer } from "../schema-preview-drawer";

interface SchemaStructureHeaderProps {
  isEditMode: boolean;
  isDirty: boolean;
  isValid: boolean;
  hasSelectedRows: boolean;
  selectedFieldEntriesLength: number;
  fieldsLength: number;
  schemaId: string;
  projectKey: string;
  isClsEnabled?: boolean;
  isRlsEnabled?: boolean;
  schemaName: string;
  schemaType?: number;
  templateFields: Array<{ name: string; type?: string; isArray: boolean }>;
  previewData: Record<string, unknown>;
  activeTab: "attribute" | "data";
  onTabChange: (tab: "attribute" | "data") => void;
  onEditToggle: () => void;
  // onBulkManageAccess: () => void;
  onBulkDuplicate: () => void;
  onBulkDelete: () => void;
  onSelectAll: (checked: boolean) => void;
  isPreviewDrawerOpen: boolean;
  setIsPreviewDrawerOpen: (open: boolean) => void;
  /** When provided, Save uses onClick instead of type="submit" (avoids nested form issues) */
  onSaveClick?: () => void;
}

export function SchemaStructureHeader({
  isEditMode,
  isDirty,
  isValid,
  hasSelectedRows,
  selectedFieldEntriesLength,
  fieldsLength,
  // schemaId,
  // projectKey,
  // isClsEnabled,
  // isRlsEnabled,
  schemaName,
  schemaType,
  templateFields,
  previewData,
  activeTab,
  onTabChange,
  onEditToggle,
  // onBulkManageAccess,
  onBulkDuplicate,
  onBulkDelete,
  onSelectAll,
  setIsPreviewDrawerOpen,
  onSaveClick,
}: SchemaStructureHeaderProps) {
  const fieldLength = Object.keys(previewData).length;
  const isShowPreviewButton = fieldLength > 0;

  const SchemaTabs = (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as "attribute" | "data")}>
      <TabsList className="h-8 gap-1 bg-transparent p-0">
        <TabsTrigger
          value="attribute"
          className="h-8 rounded-none border-b-2 border-transparent px-4 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          Attribute
        </TabsTrigger>
        {schemaType !== 2 && (
          <TabsTrigger
            value="data"
            className="h-8 rounded-none border-b-2 border-transparent px-4 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Data
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );

  return (
    <>
      {/* Desktop Header */}
      <div className="hidden items-center justify-between xl:flex">
        {SchemaTabs}

        <div className="flex gap-2">
          {isEditMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-w-[110px] justify-between"
                >
                  Action
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {/* {schemaType === 1 && (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={!hasSelectedRows}
                    onSelect={onBulkManageAccess}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Manage access
                  </DropdownMenuItem>
                )} */}

                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={!hasSelectedRows}
                  onSelect={onBulkDuplicate}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-red-500 focus:text-red-500"
                  disabled={!hasSelectedRows}
                  onSelect={onBulkDelete}
                >
                  <Trash className="mr-2 h-4 w-4 text-red-500" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isEditMode && (
            <>
              {/* {schemaType === 1 && (
                <SchemaClsToggle
                  schemaId={schemaId}
                  projectKey={projectKey}
                  isClsEnabled={isClsEnabled}
                  isRlsEnabled={isRlsEnabled}
                />
              )} */}

              {isShowPreviewButton && (
                <SchemaPreviewDrawer
                  schemaName={schemaName}
                  schemaType={schemaType}
                  fields={templateFields}
                  previewData={previewData}
                  title={`${schemaName} preview`}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      Preview
                    </Button>
                  }
                />
              )}
            </>
          )}

          {(isEditMode || activeTab === "attribute") && (
            <Button type="button" variant="outline" size="sm" onClick={onEditToggle}>
              {isEditMode ? "Cancel" : "Edit"}
            </Button>
          )}

          {isEditMode && (
            <Button
              size="sm"
              type={onSaveClick ? "button" : "submit"}
              disabled={!isValid || !isDirty}
              onClick={onSaveClick}
            >
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="block xl:hidden">
        {isEditMode ? (
          <>
            {/* First Line: Title */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Schema Structure</h2>
            </div>

            {/* Second Line: Action Buttons */}
            <div className="mt-3 flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-w-[110px] justify-between"
                  >
                    Action
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {/* <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={!hasSelectedRows}
                    onSelect={onBulkManageAccess}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Manage access
                  </DropdownMenuItem> */}
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={!hasSelectedRows}
                    onSelect={onBulkDuplicate}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer text-red-500 focus:text-red-500"
                    disabled={!hasSelectedRows}
                    onSelect={onBulkDelete}
                  >
                    <Trash className="mr-2 h-4 w-4 text-red-500" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" size="sm" onClick={onEditToggle}>
                Cancel
              </Button>
              <Button
                size="sm"
                type={onSaveClick ? "button" : "submit"}
                disabled={!isValid || !isDirty}
                onClick={onSaveClick}
              >
                Save
              </Button>
            </div>

            {/* Third Line: Select All */}
            <div className="mb-3 mt-3 flex items-center gap-2">
              <Checkbox
                checked={hasSelectedRows && selectedFieldEntriesLength === fieldsLength}
                onCheckedChange={onSelectAll}
                aria-label="Select all properties"
              />
              <span className="text-sm font-medium">Select all</span>
            </div>
          </>
        ) : (
          <>
            {/* View Mode: Tabs and Three-dot Menu */}
            <div className="flex items-center justify-between">
              {SchemaTabs}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {activeTab === "attribute" && (
                    <DropdownMenuItem className="cursor-pointer" onSelect={onEditToggle}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => setIsPreviewDrawerOpen(true)}
                  >
                    Preview
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Schema structure access on second line */}
            {schemaType === 1 && (
              <div className="mb-3 mt-3">
                {/* <SchemaClsToggle
                  schemaId={schemaId}
                  projectKey={projectKey}
                  isClsEnabled={isClsEnabled}
                  isRlsEnabled={isRlsEnabled}
                /> */}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
