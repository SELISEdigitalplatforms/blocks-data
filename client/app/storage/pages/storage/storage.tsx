"use client";

import { FilterChangeHandler } from "@/components/filter-toolbar";
import { Button } from "@/components/ui-kits/button/button";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { useOsSecretManagementUrl, useStoragePath } from "@/hooks/use-scoped-path";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { IStorageConfiguration } from "@/storage/models/storage.model";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useGetStorageConfigurations } from "../../hooks/use-storage-configuration";
import {
  filterStorageConfigurations,
  type StorageFilterValues,
} from "../../utils/filter-storage-configurations";
import {
  StorageCard,
  StorageCardData,
} from "./components/storage-card/storage-card";
import { StorageDetailsDrawer } from "./components/storage-details-drawer/storage-details-drawer";
import { StorageFiltersToolbar } from "./components/storage-filters-toolbar/storage-filters-toolbar";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_STORAGE_MODULE = "data.storage";

type FilterValues = StorageFilterValues;

// Helper function to map API configuration to card data
const mapConfigurationToCardData = (
  config: IStorageConfiguration,
): StorageCardData => {
  return {
    id: config.itemId,
    provider: config.storageStrategy,
    // status: "Configured",
    providerIcon: "",
    providerColor: "",
    title: config.name,
    subtitle:
      config.storageStrategy === "Amazon"
        ? "AWS"
        : config.storageStrategy === "Azure"
          ? tStatic(DATA_STORAGE_MODULE, "STORAGE.AZURE")
          : config.storageStrategy === "S3Compatible"
            ? tStatic(DATA_STORAGE_MODULE, "STORAGE.AWS_S3_COMPATIBLE")
            : "SFTP",
    // folderCount: 0,
    // fileCount: 0,
  };
};

export function Storage() {
  const { t } = useT(DATA_STORAGE_MODULE);
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

  const onChange: FilterChangeHandler<FilterValues> = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onReset = () => {
    setFilters({
      search: "",
      providers: [],
      types: [],
    });
  };

  const filteredData = useMemo(() => {
    const filteredConfigurations = filterStorageConfigurations(
      configurations,
      filters,
    );

    return filteredConfigurations.map(mapConfigurationToCardData);
  }, [configurations, filters]);

  const handleCardClick = (id: string) => {
    navigate(`${storagePath}?id=${encodeURIComponent(id)}`);
  };

  const handleViewDetails = (id: string) => {
    const storage = configurations.find((config) => config.itemId === id);
    if (storage) {
      setSelectedStorage(storage);
      setDetailsOpen(true);
    }
  };

  const handleRemove = (id: string) => {
    console.error("Remove configuration:", id);
    // TODO: Implement remove logic
  };

  const handleDisconnect = (id: string) => {
    console.error("Disconnect storage:", id);
    // TODO: Implement disconnect logic
  };

  return (
    <main className="flex flex-col">
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{t("STORAGE.STORAGE")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                `${getRuntimeEnv("BLOCKS_DATA_BASE_URL")}/swagger/index.html`,
                "_blank",
              )
            }
          >
            {t("STORAGE.API_DOCS")}
          </Button>
          {/* <LogMenu link="/app/services/storage/logs" />{" "} */}
        </div>
      </div>

      <div className="mt-6 rounded-sm border bg-card p-6">
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
                <div className="mt-auto flex gap-3 pt-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
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
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted-foreground">
              {t("STORAGE.NO_STORAGE_CONFIGURATIONS_FOUND")}
            </p>
          </div>
        )}
      </div>


      <StorageDetailsDrawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        storage={selectedStorage}
      />
    </main>
  );
}
