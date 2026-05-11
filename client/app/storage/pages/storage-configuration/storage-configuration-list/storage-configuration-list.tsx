"use client";

import { Pencil } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui-kits/accordion/accordion";
import { Dialog, DialogTrigger } from "@/components/ui-kits/dialog/dialog";
import { Button } from "@/components/ui-kits/button/button";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Pagination } from "@/components/ui-kits/pagination/pagination";
import { useEffect, useState } from "react";
import { DeleteStorageConfiguration } from "../delete-storage-configuration/delete-storage-configuration";
import { IStorageConfiguration, STORAGE_STRATEGIES } from "@/storage/models/storage.model";
import { SaveStorageConfiguration } from "../save-storage-configuration/save-storage-configuration";
import { MaskedText } from "@/components/masked-text";

type StorageConfigurationListProps = {
  configurations: IStorageConfiguration[];
  isLoading: boolean;
};

const LoadingSkelton = () => {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="rounded-sm border bg-background p-4">
        <Skeleton className="h-6 w-1/4"></Skeleton>
        <Skeleton className="my-4 h-8"></Skeleton>
        <Skeleton className="my-4 h-8"></Skeleton>
        <Skeleton className="h-8"></Skeleton>
      </div>
      <div className="rounded-sm border bg-background p-4">
        <Skeleton className="h-8"></Skeleton>
      </div>
      <div className="rounded-sm border bg-background p-4">
        <Skeleton className="h-8"></Skeleton>
      </div>
      <div className="rounded-sm border bg-background p-4">
        <Skeleton className="h-8"></Skeleton>
      </div>
      <div className="rounded-sm border bg-background p-4">
        <Skeleton className="h-8"></Skeleton>
      </div>
    </div>
  );
};

const Item = ({ label, description }: { label: string; description: string }) => {
  return (
    <div>
      <p className="text-sm font-medium text-low-emphasis">{label}</p>
      <p className="text-wrap break-all text-base font-normal text-high-emphasis">{description}</p>
    </div>
  );
};

export const StorageConfigurationList = ({
  configurations,
  isLoading,
}: StorageConfigurationListProps) => {
  const [openModelId, setOpenModeId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 5;

  useEffect(() => {
    if (configurations.length <= page * pageSize && page > 0) {
      setPage((page) => page - 1);
    }
  }, [configurations, page]);

  if (isLoading) return <LoadingSkelton />;

  const currentConfigurations = configurations.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div className="mt-6">
      <Accordion
        type="single"
        collapsible
        defaultValue={currentConfigurations.length ? currentConfigurations[0].itemId : ""}
        className="grid grid-cols-1 gap-y-6"
      >
        {currentConfigurations.length > 0 &&
          currentConfigurations.map((configuration) => (
            <AccordionItem
              key={configuration.itemId}
              value={configuration.itemId}
              className={`rounded-sm border bg-background px-5`}
            >
              <AccordionTrigger className="text-lg font-semibold hover:no-underline md:text-xl">
                {configuration.storageStrategy} (
                {
                  STORAGE_STRATEGIES.find((item) => item.value === configuration.storageStrategy)
                    ?.label
                }
                )
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex gap-4">
                  {configuration.name !== "Default" && (
                    <>
                      <Dialog
                        open={configuration.itemId === openModelId}
                        onOpenChange={(value) => {
                          if (!value) return setOpenModeId(null);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenModeId(configuration.itemId)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only sm:not-sr-only sm:ml-2">Edit</span>
                          </Button>
                        </DialogTrigger>
                        <SaveStorageConfiguration
                          configuration={configuration}
                          onClose={() => {}}
                        />
                      </Dialog>
                      <DeleteStorageConfiguration configuration={configuration} />
                    </>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Item label="Configuration name" description={configuration.name} />
                  {configuration.storageStrategy === "Amazon" && (
                    <>
                      <Item label="Access key" description={configuration.accessKey || ""} />
                      <Item label="Secret key" description={configuration.secretKey || ""} />
                      <Item
                        label="Region endpoint"
                        description={configuration.cloudStorageRegionEndPoint || ""}
                      />
                    </>
                  )}
                  {configuration.storageStrategy === "Azure" && (
                    <>
                      <div className="col-span-1">
                        <div>
                          <p className="text-sm font-medium text-low-emphasis">Connection string</p>
                          <div className="text-wrap break-all text-base font-normal text-high-emphasis">
                            <MaskedText text={configuration.connectionString || ""} length={40} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {configuration.storageStrategy === "SftpStorage" && (
                    <>
                      <Item
                        label="Remote base path"
                        description={configuration.remoteBasePath || ""}
                      />
                      <Item label="Host" description={configuration.host || ""} />
                      <Item label="Port" description={configuration.port || ""} />
                      <Item label="Username" description={configuration.userName || ""} />
                      <Item label="Password" description={configuration.password || ""} />
                    </>
                  )}
                  {configuration.storageStrategy === "S3Compatible" && (
                    <>
                      <Item label="Access key" description={configuration.accessKey || ""} />
                      <Item label="Secret key" description={configuration.secretKey || ""} />
                      <Item label="Host URL" description={configuration.host || ""} />
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
      <div className="mt-4 flex justify-end">
        {configurations.length && configurations.length > pageSize && (
          <Pagination
            onChange={(page) => setPage(page)}
            page={page}
            pageSize={pageSize}
            totalCount={configurations.length}
          />
        )}
      </div>
    </div>
  );
};
