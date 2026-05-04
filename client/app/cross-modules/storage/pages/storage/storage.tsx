"use client";

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { Button } from "@/components/ui-kits/button/button";
import { useGetStorageConfigurations } from "../../hooks/use-storage-configuration";
import { LogMenu } from "@blocks-lmt/components";
import { SaveStorageConfiguration } from "../storage-configuration/save-storage-configuration/save-storage-configuration";
import { StorageCard, StorageCardData } from "./components/storage-card/storage-card";
import { FilterChangeHandler } from "@/components/filter-toolbar";
import { StorageFiltersToolbar } from "./components/storage-filters-toolbar/storage-filters-toolbar";
import { IStorageConfiguration } from "@blocks-storage/models/storage.model";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { StorageDetailsDrawer } from "./components/storage-details-drawer/storage-details-drawer";

type FilterValues = {
  search: string;
  providers: string[];
  types: string[];
};

// Helper function to map API configuration to card data
const mapConfigurationToCardData = (config: IStorageConfiguration): StorageCardData => {
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
          ? "Azure"
          : config.storageStrategy === "S3Compatible"
            ? "AWS S3 Compatible"
            : "SFTP",
    // folderCount: 0,
    // fileCount: 0,
  };
};

export function Storage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean>(false);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [selectedStorage, setSelectedStorage] = useState<IStorageConfiguration | null>(null);
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    providers: [],
    types: [],
  });

  const { data, isLoading, isFetching } = useGetStorageConfigurations();

  const loading = isLoading || isFetching;

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

  const storageCards = useMemo(() => {
    return configurations.map(mapConfigurationToCardData);
  }, [configurations]);

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
    return storageCards.filter((item) => {
      const matchesSearch = item.title.toLowerCase().includes(filters.search.toLowerCase());
      const matchesProvider =
        filters.providers.length === 0 || filters.providers.includes(item.provider);
      // const matchesType = filters.types.length === 0 || filters.types.includes(item.status);
      return matchesSearch && matchesProvider;
    });
  }, [storageCards, filters]);

  const handleCardClick = (id: string) => {
    console.log("🎯 handleCardClick called with id:", id);
    const targetPath = `/services/storage?id=${encodeURIComponent(id)}`;
    console.log("📍 Navigating to:", targetPath);
    navigate(targetPath);
  };

  const handleViewDetails = (id: string) => {
    const storage = configurations.find((config) => config.itemId === id);
    if (storage) {
      setSelectedStorage(storage);
      setDetailsOpen(true);
    }
  };

  const handleRemove = (id: string) => {
    console.log("Remove configuration:", id);
    // TODO: Implement remove logic
  };

  const handleDisconnect = (id: string) => {
    console.log("Disconnect storage:", id);
    // TODO: Implement disconnect logic
  };

  return (
    <main className="flex flex-col">
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Storage</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                `${process.env.NEXT_PUBLIC_API_BASE_URL}/uds/v1/swagger/index.html`,
                "_blank",
              )
            }
          >
            API Docs
          </Button> */}
          <LogMenu link="/services/storage/logs" />{" "}
        </div>
      </div>

      <div className="mt-6 rounded-sm border bg-card p-6">
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
            <p className="text-muted-foreground">No storage configurations found.</p>
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
    </main>
  );
}
