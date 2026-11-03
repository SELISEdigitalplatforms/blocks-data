import React, { useState } from "react";
import { useDeleteNotificationConfig, useGetNotificationConfigs } from "../hooks/use-notifications";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui-kits/card/card";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { EllipsisVertical, Pencil, Trash } from "lucide-react";
import NewNotificationConfiguration from "../modals/new-notification-configuration";
import { channelsToNotify, notificationTypes } from "../constants/notification.constant";
import type { INotificationConfig } from "../models/notification.model";
import { Pagination } from "@/components/ui-kits/pagination/pagination";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { Button } from "@/components/ui-kits/button/button";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_CONSOLE_MODULE = "data.console";

const columns = [
  { key: "name", get label() { return tStatic(DATA_CONSOLE_MODULE, "common:NAME"); } },
  { key: "channelToNotify", get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONFIGURATION_LIST.CHANNEL"); } },
  { key: "notificationType", get label() { return tStatic(DATA_CONSOLE_MODULE, "common:TYPE"); } },
  { key: "enablePersistence", get label() { return tStatic(DATA_CONSOLE_MODULE, "NOTIFICATION_CONFIGURATION_LIST.PERSISTENCE"); } },
  { key: "actions", label: "" },
];

interface NotificationConfigurationListProps {
  addConfigOpen?: boolean;
  onAddConfigOpenChange?: (open: boolean) => void;
}

const NotificationConfigurationList: React.FC<NotificationConfigurationListProps> = ({
  addConfigOpen,
  onAddConfigOpenChange,
}) => {
  const { t } = useT(DATA_CONSOLE_MODULE);
  const [filterData, setFilterData] = useState({ page: 0, pageSize: 10 });
  const { data, isLoading } = useGetNotificationConfigs(filterData.page, filterData.pageSize);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedConfigData, setSelectedConfigData] = useState<INotificationConfig | null>(null);

  const internalOpen = addConfigOpen ?? false;
  const setOpen = onAddConfigOpenChange ?? (() => {});

  const { isPending: isDeletePending, mutateAsync: deleteNotificationConfig } =
    useDeleteNotificationConfig();

  const onPageChangeHandler = (page: number) => {
    setFilterData((filter) => ({ ...filter, page }));
  };

  const onEditNotificationConfig = (rowData: INotificationConfig) => {
    setSelectedConfigData(rowData);
    setIsEditOpen(true);
  };

  const onDeleteNotificationConfig = (rowData: INotificationConfig) => {
    setSelectedConfigData(rowData);
    setIsDeleteDialogOpen(true);
  };

  const onConfirmDeleteConfig = async () => {
    try {
      const res = await deleteNotificationConfig({
        projectKey: selectedConfigData?.itemId ?? "",
        itemId: selectedConfigData?.itemId ?? "",
      });
      if (res?.isSuccess) {
        toast({
          variant: "success",
          title: t("common:SUCCESS"),
          description: t("NOTIFICATION_CONFIGURATION_LIST.CONFIGURATION_DELETED_SUCCESSFULLY"),
        });
        setIsDeleteDialogOpen(false);
      } else {
        toast({
          variant: "destructive",
          title: t("common:ERROR"),
          description: JSON.stringify(res?.errors),
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("common:ERROR"),
        description: JSON.stringify(error),
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Add Configuration dialog (controlled externally) */}
      <Dialog open={internalOpen} onOpenChange={setOpen}>
        <NewNotificationConfiguration
          key={internalOpen ? "open" : "closed"}
          dialogTitle={t("NOTIFICATION_CONFIGURATION_LIST.ADD_CONFIGURATION")}
          onClose={setOpen}
          isEdit={false}
        />
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("NOTIFICATION_CONFIGURATION_LIST.CONFIGURATIONS")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        <Skeleton className="h-6 w-full rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
              {!isLoading && !!data?.configurations?.length && (
                data.configurations.map((config) => (
                  <TableRow key={config.itemId}>
                    <TableCell>{config.name}</TableCell>
                    <TableCell>
                      {channelsToNotify.find((x) => x.value === config.channelToNotify)?.label}
                    </TableCell>
                    <TableCell>
                      {notificationTypes.find((x) => x.value === config.notificationType)?.label}
                    </TableCell>
                    <TableCell>{config.enablePersistence ? t("common:YES") : t("common:NO")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-5 w-5 p-0">
                            <EllipsisVertical width={20} height={20} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditNotificationConfig(config);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            <span>{t("common:EDIT")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-error"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteNotificationConfig(config);
                            }}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            <span>{t("common:DELETE")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {!isLoading && !data?.configurations?.length && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center">
                    {t("NOTIFICATION_CONFIGURATION_LIST.NO_NOTIFICATION_CONFIGURATIONS_FOUND")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Delete confirmation */}
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            {!isLoading && selectedConfigData && (
              <ConfirmationModal
                onCancel={() => {}}
                onConfirm={() => onConfirmDeleteConfig()}
                data={{
                  dialogTitle: t("NOTIFICATION_CONFIGURATION_LIST.CONFIRMATION"),
                  dialogSubtitle: t("NOTIFICATION_CONFIGURATION_LIST.ARE_YOU_SURE_YOU_WANT_TO", { name: selectedConfigData?.name }),
                }}
                buttonState={{ confirm: { disable: isDeletePending } }}
              />
            )}
          </Dialog>

          {/* Edit dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            {selectedConfigData && (
              <NewNotificationConfiguration
                key={`${selectedConfigData.itemId}-${isEditOpen}`}
                dialogTitle={t("NOTIFICATION_CONFIGURATION_LIST.EDIT_CONFIGURATION")}
                previousData={selectedConfigData}
                isEdit={true}
                onClose={setIsEditOpen}
              />
            )}
          </Dialog>

          {!isLoading && data && data.totalCount > filterData.pageSize && (
            <div className="mt-5 flex items-center md:justify-end">
              <Pagination
                page={filterData.page}
                pageSize={filterData.pageSize}
                totalCount={data?.totalCount || 0}
                pageSizeOptions={[10]}
                onChange={onPageChangeHandler}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationConfigurationList;
