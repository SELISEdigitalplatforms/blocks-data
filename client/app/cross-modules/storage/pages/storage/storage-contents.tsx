import React, { useMemo, useState } from "react";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { useGetStorageConfigurations } from "@blocks-storage/hooks/use-storage-configuration";
import { SaveStorageConfiguration } from "../storage-configuration/save-storage-configuration/save-storage-configuration";
import { FilterChangeHandler } from "@/components/filter-toolbar";
import { IStorageConfiguration } from "@blocks-storage/models/storage.model";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import {
  StorageCard,
  StorageCardData,
} from "./components/storage-card/storage-card";
import { StorageDetailsDrawer } from "./components/storage-details-drawer/storage-details-drawer";
import { StorageFiltersToolbar } from "./components/storage-filters-toolbar/storage-filters-toolbar";
import { useNavigate } from "react-router";
import { StorageDetail } from "../storage-detail/storage-detail";

type FilterValues = {
  search: string;
  providers: string[];
  types: string[];
};

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
        ? "Azure"
        : config.storageStrategy === "S3Compatible"
          ? "AWS S3 Compatible"
          : "SFTP",
});

export function StorageContents() {
  const navigate = useNavigate();
  
  // Check if we're viewing a storage detail page
  const params = new URLSearchParams(window.location.search);
  const storageId = params.get("id");
  
  // If storageId is present, render the detail view
  if (storageId) {
    return <StorageDetail />;
  }
  
  const [open, setOpen] = useState<boolean>(false);
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
    navigate(`/services/storage?id=${encodeURIComponent(id)}`);
  };

  // const handleViewDetails = (id: string) => {
  //   const storage = configurations.find((config) => config.itemId === id);
  //   if (storage) {
  //     setSelectedStorage(storage);
  //     setDetailsOpen(true);
  //   }
  // };

  const handleRemove = (id: string) => {
    console.log("Remove configuration:", id);
    // TODO: Implement remove logic
  };

  const configurations = useMemo(() => {
    if (!data) return [];
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
    return storageCards.filter((item) => {
      const matchesSearch = item.title
        .toLowerCase()
        .includes(filters.search.toLowerCase());
      const matchesProvider =
        filters.providers.length === 0 ||
        filters.providers.includes(item.provider);
      return matchesSearch && matchesProvider;
    });
  }, [storageCards, filters]);

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
          onAddConfiguration={() => setOpen(true)}
          onConnectStorage={() => console.log("Connect to storage")}
        />

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="flex h-full flex-col rounded-sm border bg-card p-5 shadow-sm"
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
              No storage configurations found.
            </p>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <SaveStorageConfiguration onClose={setOpen} />
      </Dialog>

      <StorageDetailsDrawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        storage={selectedStorage}
      />
    </div>
  );
}
