import { FilterChangeHandler } from "@/components/filter-toolbar";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { useOsSecretManagementUrl, useStoragePath } from "@/hooks/use-scoped-path";
import { useGetStorageConfigurations } from "@/storage/hooks/use-storage-configuration";
import { IStorageConfiguration } from "@/storage/models/storage.model";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  filterStorageConfigurations,
  type StorageFilterValues,
} from "../../utils/filter-storage-configurations";
import { DownloadPanel } from "../../components/download-panel/download-panel";
import { StorageDetail } from "../storage-detail/storage-detail";
import {
  StorageCard,
  StorageCardData,
} from "./components/storage-card/storage-card";
import { StorageDetailsDrawer } from "./components/storage-details-drawer/storage-details-drawer";
import { StorageFiltersToolbar } from "./components/storage-filters-toolbar/storage-filters-toolbar";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

type FilterValues = StorageFilterValues;

const mapConfigurationToCardData = (
  config: IStorageConfiguration,
): StorageCardData => ({
  id: config.itemId,
  provider: config.storageStrategy,
  providerIcon: "",
  providerColor: "",
  title: config.name,
  subtitle:
    config.storageStrategy === "Amazon"
      ? "AWS"
      : config.storageStrategy === "Azure"
        ? tStatic("data.storage", "STORAGE_CONTENTS.AZURE")
        : config.storageStrategy === "S3Compatible"
          ? tStatic("data.storage", "STORAGE_CONTENTS.AWS_S3_COMPATIBLE")
          : "SFTP",
});

export function StorageContentsWrapper() {
  // Use useLocation to react to URL changes
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const storageId = params.get("id");

  // Render detail view or list view based on storageId query parameter.
  // The download panel is mounted here so it shows on both and survives navigation between them.
  return (
    <>
      {storageId ? <StorageDetail /> : <StorageContents />}
      <DownloadPanel />
    </>
  );
}

export function StorageContents() {
  const { t } = useT("data.storage");
  const navigate = useNavigate();
  const storagePath = useStoragePath();
  const osConfigUrl = useOsSecretManagementUrl("storage");
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [selectedStorage, setSelectedStorage] =
    useState<IStorageConfiguration | null>(null);
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    providers: [],
    types: [],
  });

  const { data, isLoading, isFetching } = useGetStorageConfigurations();

  const loading = isLoading || isFetching;

  const handleCardClick = (id: string) => {
    navigate(`${storagePath}?id=${encodeURIComponent(id)}`);
  };

  const handleRemove = (id: string) => {
    console.error("Remove configuration:", id);
  };

  const configurations = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const index = data.findIndex((item) => item.name === "Default");
    if (index > -1) {
      const temps = [...data];
      const [item] = temps.splice(index, 1);
      temps.unshift(item);
      return temps;
    }
    return data;
  }, [data]);

  const storageCards = useMemo(
    () => configurations.map(mapConfigurationToCardData),
    [configurations],
  );

  const onChange: FilterChangeHandler<FilterValues> = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const onReset = () => {
    setFilters({ search: "", providers: [], types: [] });
  };

  const filteredData = useMemo(() => {
    const filteredConfigurations = filterStorageConfigurations(
      configurations,
      filters,
    );

    return filteredConfigurations.map(mapConfigurationToCardData);
  }, [configurations, filters]);

  const handleViewDetails = (id: string) => {
    const storage = configurations.find((config) => config.itemId === id);
    if (storage) {
      setSelectedStorage(storage);
      setDetailsOpen(true);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="mt-2 rounded-sm border bg-card p-6">
        <StorageFiltersToolbar
          filters={filters}
          onChange={onChange}
          onReset={onReset}
          onAddConfiguration={() => window.open(osConfigUrl, "_blank")}
          onConnectStorage={() => console.error("Connect to storage")}
        />

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="flex h-full flex-col rounded-sm border bg-card p-5 shadow-xs"
              >
                <div className="flex items-start gap-3 pb-3">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                  <Skeleton className="h-5 w-5" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredData.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredData.map((storage) => (
              <StorageCard
                key={storage.id}
                data={storage}
                onClick={handleCardClick}
                onViewDetails={handleViewDetails}
                onRemove={handleRemove}
                // onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted-foreground">
              {t("STORAGE_CONTENTS.NO_STORAGE_CONFIGURATIONS_FOUND")}
            </p>
          </div>
        )}
      </div>


      <StorageDetailsDrawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        storage={selectedStorage}
      />
    </div>
  );
}
