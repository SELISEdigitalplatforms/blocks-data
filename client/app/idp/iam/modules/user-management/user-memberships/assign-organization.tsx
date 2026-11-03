
import { useState } from "react";
import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-kits/dialog/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useGetOrganizations } from "@blocks-idp/iam/hooks/use-organization";
import { useGetRoles } from "@blocks-idp/iam/hooks/use-roles";
import { useUpdateUser, useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { IMembership } from "@blocks-idp/iam/models/user";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui-kits/command/command";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui-kits/badge/badge";
import { useT } from "@seliseblocks/genesis-os/i18n";

type AssignOrganizationProps = {
  userId: string;
  projectKey: string;
};

export const AssignOrganization = ({ userId, projectKey }: AssignOrganizationProps) => {
  const { t } = useT("data.idp.iam");
  const [open, setOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const { data: userData } = useGetUserById({ id: userId, projectKey });
  const { data: orgsData, isLoading: isOrgsLoading } = useGetOrganizations({
    projectKey,
    page: 0,
    pageSize: 1000,
  });
  const { data: rolesData, isLoading: isRolesLoading } = useGetRoles({
    projectKey,
    page: 0,
    pageSize: 1000,
    sort: { property: "Name", isDescending: false },
    filter: { search: "" },
  });

  const { mutateAsync, isPending } = useUpdateUser({ id: userId, projectKey });

  const existingMemberships = userData?.data?.memberships || [];
  const organizations = orgsData?.organizations || [];
  const roles = rolesData?.data || [];

  // Filter out organizations that are already assigned or disabled
  const availableOrgs = organizations.filter(
    (org) => org.isEnable && !existingMemberships.some((m) => m.organizationId === org.itemId),
  );

  // Convert roles to options format for MultiSelect
  const roleOptions = roles.map((role) => ({
    label: role.name,
    value: role.slug,
  }));

  const onConfirm = async () => {
    if (!selectedOrgId || selectedRoles.length === 0) {
      showErrorToast({ errors: t("ASSIGN_ORGANIZATION.PLEASE_SELECT_AN_ORGANIZATION_AND_AT") });
      return;
    }

    try {
      const newMembership: IMembership = {
        organizationId: selectedOrgId,
        roles: selectedRoles,
        permissions: [],
      };

      const updatedMemberships = [...existingMemberships, newMembership];

      const res = await mutateAsync({
        ...userData?.data,
        memberships: updatedMemberships,
        itemId: userId,
        projectKey,
      });

      if (!res.isSuccess) {
        showErrorToast({ errors: res.errors });
        return;
      }

      showSuccessToast({ description: t("ASSIGN_ORGANIZATION.ORGANIZATION_ASSIGNED_SUCCESSFULLY") });
      reset();
      setOpen(false);
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({ errors: error.errors });
      } else {
        showErrorToast({ errors: t("ASSIGN_ORGANIZATION.SOMETHING_WENT_WRONG") });
      }
    }
  };

  const reset = () => {
    setSelectedOrgId("");
    setSelectedRoles([]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-10 text-sm text-primary">
          <Plus className="h-5 w-5 text-primary md:mr-2.5" />
          <span className="sr-only sm:not-sr-only">{t("ASSIGN_ORGANIZATION.ASSIGN")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("ASSIGN_ORGANIZATION.ASSIGN_ORGANIZATION")}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("ASSIGN_ORGANIZATION.ORGANIZATION_NAME")}</label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger>
                <SelectValue placeholder={t("ASSIGN_ORGANIZATION.ORGANIZATION_NAME")} />
              </SelectTrigger>
              <SelectContent>
                {isOrgsLoading && (
                  <SelectItem value="loading" disabled>
                    {t("common:LOADING")}
                  </SelectItem>
                )}
                {!isOrgsLoading && availableOrgs.length === 0 && (
                  <SelectItem value="none" disabled>
                    {t("ASSIGN_ORGANIZATION.NO_ORGANIZATIONS_AVAILABLE")}
                  </SelectItem>
                )}
                {!isOrgsLoading && availableOrgs.length !== 0 && (
                  availableOrgs.map((org) => (
                    <SelectItem key={org.itemId} value={org.itemId}>
                      {org.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("ASSIGN_ORGANIZATION.SELECT_AT_LEAST_ONE_ROLE_TO")}</label>
            {isRolesLoading && (
              <div className="p-2 text-sm text-muted-foreground">{t("ASSIGN_ORGANIZATION.LOADING_ROLES")}</div>
            )}
            {!isRolesLoading && roles.length === 0 && (
              <div className="p-2 text-sm text-muted-foreground">{t("ASSIGN_ORGANIZATION.NO_ROLES_AVAILABLE")}</div>
            )}
            {!isRolesLoading && roles.length !== 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {selectedRoles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedRoles.length > 2 ? (
                          <Badge variant="secondary">{t("ASSIGN_ORGANIZATION.LENGTH_SELECTED", { length: selectedRoles.length })}</Badge>
                        ) : (
                          selectedRoles.map((slug) => {
                            const role = roles.find((r) => r.slug === slug);
                            return (
                              <Badge key={slug} variant="secondary">
                                {role?.name || slug}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      t("ASSIGN_ORGANIZATION.SELECT_ROLES")
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("ASSIGN_ORGANIZATION.SEARCH_ROLES")} />
                    <CommandList>
                      <CommandEmpty>{t("ASSIGN_ORGANIZATION.NO_ROLES_FOUND")}</CommandEmpty>
                      <CommandGroup>
                        {roleOptions.map((option) => {
                          const isSelected = selectedRoles.includes(option.value);
                          return (
                            <CommandItem
                              key={option.value}
                              onSelect={() => {
                                const newSelected = isSelected
                                  ? selectedRoles.filter((v) => v !== option.value)
                                  : [...selectedRoles, option.value];
                                setSelectedRoles(newSelected);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {option.label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isPending || !selectedOrgId || selectedRoles.length === 0}
          >
            {isPending ? t("ASSIGN_ORGANIZATION.ASSIGNING") : t("common:CONFIRM")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
