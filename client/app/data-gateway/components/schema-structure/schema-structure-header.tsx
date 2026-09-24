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

interface SchemaStructureHeaderProps {
  isEditMode: boolean;
  hasSelectedRows: boolean;
  selectedFieldEntriesLength: number;
  fieldsLength: number;
  schemaType?: number;
  activeTab: "attribute" | "data" | "indexes";
  onTabChange: (tab: "attribute" | "data" | "indexes") => void;
  onEditToggle: () => void;
  onBulkDuplicate: () => void;
  onBulkDelete: () => void;
  onSelectAll: (checked: boolean) => void;
  /** Mobile's "…" menu still has its own Preview entry; desktop's trigger
   * moved to sit beside the Schema Access button in SchemaBasicInfo. */
  setIsPreviewDrawerOpen: (open: boolean) => void;
}

export function SchemaStructureHeader({
  isEditMode,
  hasSelectedRows,
  selectedFieldEntriesLength,
  fieldsLength,
  schemaType,
  activeTab,
  onTabChange,
  onEditToggle,
  onBulkDuplicate,
  onBulkDelete,
  onSelectAll,
  setIsPreviewDrawerOpen,
}: SchemaStructureHeaderProps) {
  const SchemaTabs = (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as "attribute" | "data" | "indexes")}
    >
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
        {schemaType !== 2 && (
          <TabsTrigger
            value="indexes"
            className="h-8 rounded-none border-b-2 border-transparent px-4 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Indexes
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

        <div className="flex items-center gap-2">
          {isEditMode && hasSelectedRows && (
            <span className="text-xs text-muted-foreground">
              {selectedFieldEntriesLength} selected
            </span>
          )}
          {isEditMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-w-[130px] justify-between"
                >
                  Bulk actions
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
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
          {(isEditMode || activeTab === "attribute") && (
            <Button type="button" variant="outline" size="sm" onClick={onEditToggle}>
              {isEditMode ? "Cancel" : "Edit"}
            </Button>
          )}

          {/* Save lives in the dirty bar under the table now: it was only ever
              enabled when the form was dirty, which is exactly when that bar
              is on screen. */}
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
            {hasSelectedRows && (
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedFieldEntriesLength} selected
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-w-[130px] justify-between"
                  >
                    Bulk actions
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
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

          </>
        )}
      </div>
    </>
  );
}
