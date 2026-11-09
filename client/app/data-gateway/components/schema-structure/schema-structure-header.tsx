import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Copy, MoreVertical, Trash } from "lucide-react";
import { useT } from "@seliseblocks/genesis-os/i18n";

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
  /** Opens every object property in the table's tree; shown only when some row can open. */
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
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
  onExpandAll,
  onCollapseAll,
}: SchemaStructureHeaderProps) {
  const { t } = useT("data.gateway.schema");
  /**
   * The underline used to switch with no transition at all — the border flipped
   * from transparent to primary on one trigger and back on another, which reads
   * as a blink rather than a move. Colour and text now ease over the shared
   * `--dg-duration-fast`, and the list carries its own hairline rail so the
   * active underline sits *on* something instead of floating under the label.
   */
  const TAB_TRIGGER_CLASS =
    "dg-interactive relative h-8 rounded-none border-b-2 border-transparent bg-transparent px-4 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

  const SchemaTabs = (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as "attribute" | "data" | "indexes")}
    >
      <TabsList className="h-8 gap-1 rounded-none bg-transparent p-0">
        <TabsTrigger value="attribute" className={TAB_TRIGGER_CLASS}>
          {t("SCHEMA_STRUCTURE_HEADER.ATTRIBUTE")}
        </TabsTrigger>
        {schemaType !== 2 && (
          <TabsTrigger value="data" className={TAB_TRIGGER_CLASS}>
            {t("SCHEMA_STRUCTURE_HEADER.DATA")}
          </TabsTrigger>
        )}
        {schemaType !== 2 && (
          <TabsTrigger value="indexes" className={TAB_TRIGGER_CLASS}>
            {t("SCHEMA_STRUCTURE_HEADER.INDEXES")}
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );

  return (
    <>
      {/* Desktop Header.
          `-mx-5 px-5` pulls the rule out to the card's own edges — the Card's
          padding would otherwise leave it floating 20px short on each side,
          which is what made the active underline look unanchored. */}
      <div className="-mx-5 hidden items-center justify-between border-b border-border/40 px-5 xl:flex">
        {SchemaTabs}

        <div className="flex items-center gap-2">
          {!isEditMode && activeTab === "attribute" && onExpandAll && onCollapseAll && (
            <div className="flex items-center">
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground" onClick={onExpandAll}>
                <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
                {t("SCHEMA_STRUCTURE_HEADER.EXPAND_ALL")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground" onClick={onCollapseAll}>
                <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
                {t("SCHEMA_STRUCTURE_HEADER.COLLAPSE_ALL")}
              </Button>
            </div>
          )}
          {isEditMode && hasSelectedRows && (
            <span className="text-xs text-muted-foreground">
              {t("SCHEMA_STRUCTURE_HEADER.SELECTEDFIELDENTRIESLENGTH_SELECTED", { selectedFieldEntriesLength })}
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
                  {t("SCHEMA_STRUCTURE_HEADER.BULK_ACTIONS")}
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
                  {t("SCHEMA_STRUCTURE_HEADER.DUPLICATE")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-red-500 focus:text-red-500"
                  disabled={!hasSelectedRows}
                  onSelect={onBulkDelete}
                >
                  <Trash className="mr-2 h-4 w-4 text-red-500" />
                  {t("common:DELETE")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {(isEditMode || activeTab === "attribute") && (
            <Button type="button" variant="outline" size="sm" onClick={onEditToggle}>
              {isEditMode ? t("common:CANCEL") : t("common:EDIT")}
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
              <h2 className="text-lg font-semibold">{t("SCHEMA_STRUCTURE_HEADER.SCHEMA_STRUCTURE")}</h2>
            </div>

            {/* Second Line: Action Buttons */}
            {hasSelectedRows && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("SCHEMA_STRUCTURE_HEADER.SELECTEDFIELDENTRIESLENGTH_SELECTED", { selectedFieldEntriesLength })}
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
                    {t("SCHEMA_STRUCTURE_HEADER.BULK_ACTIONS")}
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
                    {t("SCHEMA_STRUCTURE_HEADER.DUPLICATE")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer text-red-500 focus:text-red-500"
                    disabled={!hasSelectedRows}
                    onSelect={onBulkDelete}
                  >
                    <Trash className="mr-2 h-4 w-4 text-red-500" />
                    {t("common:DELETE")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" size="sm" onClick={onEditToggle}>
                {t("common:CANCEL")}
              </Button>
            </div>

            {/* Third Line: Select All */}
            <div className="mb-3 mt-3 flex items-center gap-2">
              <Checkbox
                checked={hasSelectedRows && selectedFieldEntriesLength === fieldsLength}
                onCheckedChange={onSelectAll}
                aria-label={t("SCHEMA_STRUCTURE_HEADER.SELECT_ALL_PROPERTIES")}
              />
              <span className="text-sm font-medium">{t("SCHEMA_STRUCTURE_HEADER.SELECT_ALL")}</span>
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
                      {t("common:EDIT")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => setIsPreviewDrawerOpen(true)}
                  >
                    {t("SCHEMA_STRUCTURE_HEADER.PREVIEW")}
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
