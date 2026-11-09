import React from "react";
import { FilterChangeHandler, FilterToolbar } from "@/components/filter-toolbar";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui-kits/button/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { useT } from "@seliseblocks/genesis-os/i18n";

type FilterValues = {
  search: string;
  providers: string[];
  types: string[];
};

type StorageFiltersToolbarProps = {
  filters: FilterValues;
  onChange: FilterChangeHandler<FilterValues>;
  onReset: () => void;
  onAddConfiguration: () => void;
  onConnectStorage: () => void;
};

export function StorageFiltersToolbar({
  filters,
  onChange,
  onReset,
  onAddConfiguration,
  // onConnectStorage,
}: StorageFiltersToolbarProps) {
  const { t } = useT("data.storage");
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="flex-1">
        <FilterToolbar
          filters={[
            { key: "search", type: "SearchInput", label: t("common:SEARCH") },
            {
              key: "providers",
              type: "MultiSelect",
              label: t("STORAGE_FILTERS_TOOLBAR.PROVIDER"),
              props: {
                options: [
                  { label: "AWS", value: "Amazon" },
                  { label: t("STORAGE_FILTERS_TOOLBAR.AZURE"), value: "Azure" },
                  { label: "SFTP", value: "SftpStorage" },
                  { label: t("STORAGE_FILTERS_TOOLBAR.AWS_S3_COMPATIBLE"), value: "S3Compatible" },
                ],
              },
            },
            // TODO: Implement Type filter later
            // {
            //   key: "types",
            //   type: "MultiSelect",
            //   label: "Type",
            //   props: {
            //     options: [
            //       { label: "Connected", value: "Connected" },
            //       { label: "Configured", value: "Configured" },
            //     ],
            //   },
            // },
          ]}
          values={filters}
          defaultValues={{ search: "", providers: [], types: [] }}
          onChange={onChange}
          onReset={onReset}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {t("common:ADD")}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onAddConfiguration}>
            <Plus className="mr-2 h-4 w-4" />
            {t("STORAGE_FILTERS_TOOLBAR.CONFIGURE_IN_BLOCKS_OS")}
          </DropdownMenuItem>
          {/* <DropdownMenuItem onClick={onConnectStorage}>
            <Plus className="mr-2 h-4 w-4" />
            Connect to your storage
          </DropdownMenuItem> */}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
