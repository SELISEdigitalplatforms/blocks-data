import { FilterControls } from "@/components/filter-toolbar";
import { Badge } from "@/components/ui-kits/badge/badge";
import { Button } from "@/components/ui-kits/button/button";
import { Card, CardContent } from "@/components/ui-kits/card/card";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-kits/dialog/dialog";
import { Pagination } from "@/components/ui-kits/pagination/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useGetPermissions } from "@blocks-idp/iam/hooks/use-permission";
import { useUserPermissions } from "@blocks-idp/iam/hooks/use-user";
import { RESOURCE_TYPE } from "@blocks-idp/iam/models/permission";
import { CirclePlus } from "lucide-react";
import { useState } from "react";
import { useT } from "@seliseblocks/genesis-os/i18n";

type AddUserPermissionProps = {
  userId: string;
  projectKey: string;
};

export const AddUserPermission = ({ userId, projectKey }: AddUserPermissionProps) => {
  const { t } = useT("data.idp.iam");
  const [open, setOpen] = useState<boolean>(false);
  const [selectedPermisson, setSelectedPermissions] = useState<string[]>([]);
  const [filter, setFilter] = useState({
    page: 0,
    pageSize: 5,
    isBuiltIn: "",
    roles: [],
    search: "",
  });
  const { data, isLoading } = useGetPermissions({
    ...filter,
    projectKey,
  });
  const { isPending, addPermissions, resources } = useUserPermissions({
    userId,
    projectKey,
  });

  const onClickHandler = async () => {
    try {
      const res = await addPermissions(selectedPermisson);
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      showSuccessToast({
        description: `${selectedPermisson.length > 1 ? t("ADD_USER_PERMISSION.NEW_PERMISSIONS_ADDED") : t("ADD_USER_PERMISSION.NEW_PERMISSION_ADDED")}`,
      });
      setSelectedPermissions([]);
      setOpen(false);
    } catch (error) {
      if (isErrorWithErrors(error)) return showErrorToast({ errors: error.errors });
      showErrorToast({ errors: t("ADD_USER_PERMISSION.SOMETHING_WENT_WRONG") });
    }
  };

  const onCheckedChangeHandler = (checked: boolean, resource: string) => {
    if (checked && resources.length + selectedPermisson.length > 4) return;
    if (checked) {
      return setSelectedPermissions((permissions) => [...permissions, resource]);
    }
    selectedPermisson.splice(selectedPermisson.indexOf(resource), 1);
    setSelectedPermissions(() => [...selectedPermisson]);
  };

  const resetFilter = () => {
    setFilter({
      page: 0,
      pageSize: 5,
      isBuiltIn: "",
      roles: [],
      search: "",
    });
    setSelectedPermissions([]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetFilter();
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="default"
          className="h-10 bg-primary text-sm"
          disabled={resources.length >= 5}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <CirclePlus className="h-5 w-5 md:mr-2.5" />
          <span className="sr-only sm:not-sr-only">{t("ADD_USER_PERMISSION.ASSIGN_PERMISSIONS")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-left">{t("ADD_USER_PERMISSION.INCLUDE_PERMISSIONS")}</DialogTitle>
          <DialogDescription>{t("ADD_USER_PERMISSION.MAXIMUM_5_PERMISSIONS_ARE_ALLOWED")}</DialogDescription>
        </DialogHeader>
        <div>
          <FilterControls.SearchInput
            placeholder={t("ADD_USER_PERMISSION.SEARCH_BY_PERMISSION_NAME")}
            onChange={(search) => setFilter((prev) => ({ ...prev, search, page: 0 }))}
            value={filter.search}
            className="h-fit w-full py-3"
          />
        </div>

        <Card>
          <CardContent className="max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>{t("common:NAME")}</TableHead>
                  <TableHead>{t("common:TYPE")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((item) => (
                  <TableRow key={item.itemId}>
                    <TableCell>
                      <Checkbox
                        checked={
                          resources.includes(item.resource) ||
                          selectedPermisson.includes(item.resource)
                        }
                        disabled={!!resources.includes(item.resource)}
                        onCheckedChange={(checked) =>
                          onCheckedChangeHandler(checked as boolean, item.resource)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="w-fit">
                        {item.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {
                        RESOURCE_TYPE.find((resoruce) => resoruce.value === item.type.toString())
                          ?.label
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="flex items-center justify-end">
          {!isLoading && data && data.totalCount > filter.pageSize && (
            <Pagination
              page={filter.page}
              pageSize={filter.pageSize}
              onChange={(page) => setFilter((prev) => ({ ...prev, page }))}
              totalCount={data.totalCount}
            />
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="default" disabled={isPending}>
              {t("common:CANCEL")}
            </Button>
          </DialogClose>
          <Button
            size="default"
            onClick={onClickHandler}
            disabled={isPending || !selectedPermisson.length}
          >
            {isPending ? t("ADD_USER_PERMISSION.INCLUDING") : t("ADD_USER_PERMISSION.INCLUDE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
