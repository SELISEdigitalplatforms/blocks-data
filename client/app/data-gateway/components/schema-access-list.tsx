"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { Button } from "@/components/ui-kits/button/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui-kits/command/command";
import { IRole } from "@blocks-idp/iam/models/role";
import { userService } from "@blocks-idp/iam/services/user.service";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import type { AccessEntry, PermissionOption } from "../models/schema-access.types";

export type { AccessEntry, PermissionOption };

export type SchemaAccessListProps = {
  entries: AccessEntry[];
  isEditing?: boolean;
  className?: string;
  onEntryChange?: (index: number, entry: AccessEntry) => void;
  onRemoveEntry?: (index: number) => void;
  roles?: IRole[];
  rolesLoading?: boolean;
  permissions?: PermissionOption[];
  permissionsLoading?: boolean;
  projectKey?: string;
};

export function SchemaAccessList({
  entries,
  isEditing = false,
  className,
  onEntryChange,
  onRemoveEntry,
  roles = [],
  rolesLoading = false,
  permissions = [],
  permissionsLoading = false,
  projectKey,
}: SchemaAccessListProps) {
  const columns = isEditing ? 3 : 2;

  const [openRoleIndex, setOpenRoleIndex] = useState<number | null>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [openUserIndex, setOpenUserIndex] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [openPermissionIndex, setOpenPermissionIndex] = useState<number | null>(null);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [debouncedPermissionSearch, setDebouncedPermissionSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedUserSearch(userSearch.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [userSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedPermissionSearch(permissionSearch.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [permissionSearch]);

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    if (!query) {
      return roles;
    }

    return roles.filter((role) => {
      const nameMatch = role.name.toLowerCase().includes(query);
      const slugMatch = role.slug?.toLowerCase().includes(query) ?? false;
      return nameMatch || slugMatch;
    });
  }, [roleSearch, roles]);

  const shouldFetchUsers = Boolean(projectKey) && isEditing && openUserIndex !== null;

  const usersQuery = useQuery({
    queryKey: ["schema-access-users", projectKey, debouncedUserSearch],
    queryFn: () =>
      userService.getUsers({
        page: 0,
        pageSize: 20,
        projectKey: projectKey as string,
        sort: { property: "Name", isDescending: false },
        filter: {
          name: debouncedUserSearch,
          email: "",
        },
      }),
    enabled: shouldFetchUsers,
    staleTime: 60_000,
  });

  const userOptions = usersQuery.data?.data ?? [];
  const isUsersLoading = usersQuery.isLoading || usersQuery.isFetching;

  const filteredPermissions = useMemo(() => {
    const query = debouncedPermissionSearch.toLowerCase();
    if (!query) {
      return permissions;
    }

    return permissions.filter((permission) => {
      const nameMatch = permission.name.toLowerCase().includes(query);
      const resourceGroupMatch = permission.resourceGroup?.toLowerCase().includes(query) ?? false;
      const resourceMatch = permission.resource?.toLowerCase().includes(query) ?? false;
      return nameMatch || resourceGroupMatch || resourceMatch;
    });
  }, [permissions, debouncedPermissionSearch]);

  const renderEmptyMessage = () => (
    <TableRow>
      <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">
        No access entries available.
      </TableCell>
    </TableRow>
  );

  return (
    <Table className={cn("mt-0", className)}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[140px] text-sm font-semibold text-foreground">Type</TableHead>
          <TableHead className="text-sm font-semibold text-foreground">Name</TableHead>
          {isEditing ? <TableHead className="w-[52px]" /> : null}
        </TableRow>
      </TableHeader>

      <TableBody>
        {entries.length === 0
          ? renderEmptyMessage()
          : entries.map((entry, index) => {
            const handleChange = (updated: Partial<AccessEntry>) => {
              if (!onEntryChange) {
                return;
              }

              const department =
                updated.department !== undefined
                  ? updated.department || undefined
                  : entry.department;

              onEntryChange(index, {
                ...entry,
                ...updated,
                department,
              });
            };

            const selectedRole = entry.roleSlug
              ? roles.find((role) => role.slug === entry.roleSlug)
              : undefined;
            const roleDisplayName = selectedRole?.name || entry.name;

            return (
              <TableRow
                key={`${entry.type}-${entry.name}-${index}`}
                className="border-b last:border-0"
              >
                <TableCell className="align-middle">
                  {isEditing ? (
                    <Select
                      value={entry.type}
                      onValueChange={(value) => {
                        const nextType = value as AccessEntry["type"];
                        const isTypeChanging = nextType !== entry.type;

                        handleChange({
                          type: nextType,
                          name: isTypeChanging ? "" : entry.name,
                          department: isTypeChanging ? undefined : entry.department,
                          roleSlug:
                            nextType === "Role"
                              ? isTypeChanging
                                ? undefined
                                : entry.roleSlug
                              : undefined,
                          userId:
                            nextType === "User"
                              ? isTypeChanging
                                ? undefined
                                : entry.userId
                              : undefined,
                          permissionResource:
                            nextType === "Permission"
                              ? isTypeChanging
                                ? undefined
                                : entry.permissionResource
                              : undefined,
                        });

                        setOpenRoleIndex(null);
                        if (nextType !== "Role") {
                          setRoleSearch("");
                        }

                        if (nextType !== "User") {
                          setOpenUserIndex(null);
                          setUserSearch("");
                          setDebouncedUserSearch("");
                        }

                        if (nextType !== "Permission") {
                          setOpenPermissionIndex(null);
                          setPermissionSearch("");
                          setDebouncedPermissionSearch("");
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-full text-left text-sm">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Role">Role</SelectItem>
                        <SelectItem value="User">User</SelectItem>
                        <SelectItem value="Permission">Permission</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm font-medium text-foreground">{entry.type}</span>
                  )}
                </TableCell>

                <TableCell className="align-middle">
                  {isEditing ? (
                    entry.type === "Role" ? (
                      <Popover
                        open={openRoleIndex === index}
                        onOpenChange={(open) => {
                          setOpenRoleIndex(open ? index : null);
                          if (!open) {
                            setRoleSearch("");
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openRoleIndex === index}
                            className="h-9 w-full justify-between text-left text-sm shadow-none"
                          >
                            {roleDisplayName || "Select role"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 sm:w-[300px]">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search roles..."
                              value={roleSearch}
                              onValueChange={setRoleSearch}
                            />
                            <CommandList
                              className="max-h-72 overscroll-contain"
                              onWheel={(event) => event.stopPropagation()}
                            >
                              {rolesLoading ? (
                                <div className="p-3 text-sm text-muted-foreground">
                                  Loading roles...
                                </div>
                              ) : (
                                <>
                                  <CommandEmpty>No roles found.</CommandEmpty>
                                  <CommandGroup>
                                    {filteredRoles.map((role) => {
                                      const isSelected = entry.roleSlug === role.slug;
                                      return (
                                        <CommandItem
                                          key={role.itemId}
                                          value={role.name}
                                          onSelect={() => {
                                            handleChange({
                                              name: role.name,
                                              roleSlug: role.slug,
                                              department: role.slug,
                                              userId: undefined,
                                              permissionResource: undefined,
                                            });
                                            setOpenRoleIndex(null);
                                            setRoleSearch("");
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              isSelected ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span>{role.name}</span>
                                            {role.slug ? (
                                              <span className="text-xs text-muted-foreground">
                                                {role.slug}
                                              </span>
                                            ) : null}
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : entry.type === "User" ? (
                      <Popover
                        open={openUserIndex === index}
                        onOpenChange={(open) => {
                          setOpenUserIndex(open ? index : null);
                          if (!open) {
                            setUserSearch("");
                            setDebouncedUserSearch("");
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openUserIndex === index}
                            className="h-9 w-full justify-between text-left text-sm shadow-none"
                          >
                            {entry.name || "Select user"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 sm:w-[320px]">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search users by name..."
                              value={userSearch}
                              onValueChange={setUserSearch}
                            />
                            <CommandList
                              className="max-h-72 overscroll-contain"
                              onWheel={(event) => event.stopPropagation()}
                            >
                              {isUsersLoading ? (
                                <div className="p-3 text-sm text-muted-foreground">
                                  Loading users...
                                </div>
                              ) : (
                                <>
                                  <CommandEmpty>No users found.</CommandEmpty>
                                  <CommandGroup>
                                    {userOptions.map((user) => {
                                      const isSelected = entry.userId === user.itemId;
                                      return (
                                        <CommandItem
                                          key={user.itemId}
                                          value={user.email || user.userName}
                                          onSelect={() => {
                                            const displayName = [user.firstName, user.lastName]
                                              .filter(Boolean)
                                              .join(" ")
                                              .trim();
                                            handleChange({
                                              name: displayName || user.email || user.userName,
                                              department: user.email,
                                              userId: user.itemId,
                                              roleSlug: undefined,
                                              permissionResource: undefined,
                                            });
                                            setOpenUserIndex(null);
                                            setUserSearch("");
                                            setDebouncedUserSearch("");
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              isSelected ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          <div className="flex min-w-0 flex-col">
                                            <span className="truncate">
                                              {[user.firstName, user.lastName]
                                                .filter(Boolean)
                                                .join(" ") ||
                                                user.userName ||
                                                user.email}
                                            </span>
                                            <span className="truncate text-xs text-muted-foreground">
                                              {user.email}
                                            </span>
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Popover
                        open={openPermissionIndex === index}
                        onOpenChange={(open) => {
                          setOpenPermissionIndex(open ? index : null);
                          if (!open) {
                            setPermissionSearch("");
                            setDebouncedPermissionSearch("");
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openPermissionIndex === index}
                            className="h-9 w-full justify-between text-left text-sm shadow-none"
                          >
                            {entry.name || "Select permission"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 sm:w-[320px]">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search permissions..."
                              value={permissionSearch}
                              onValueChange={setPermissionSearch}
                            />
                            <CommandList
                              className="max-h-72 overscroll-contain"
                              onWheel={(event) => event.stopPropagation()}
                            >
                              {permissionsLoading ? (
                                <div className="p-3 text-sm text-muted-foreground">
                                  Loading permissions...
                                </div>
                              ) : (
                                <>
                                  <CommandEmpty>No permissions found.</CommandEmpty>
                                  <CommandGroup>
                                    {filteredPermissions.map((permission) => {
                                      const isSelected =
                                        entry.permissionResource === permission.resource;
                                      return (
                                        <CommandItem
                                          key={permission.resource}
                                          value={permission.name}
                                          onSelect={() => {
                                            handleChange({
                                              name: permission.name,
                                              department:
                                                permission.resourceGroup || permission.resource,
                                              permissionResource: permission.resource,
                                              roleSlug: undefined,
                                              userId: undefined,
                                            });
                                            setOpenPermissionIndex(null);
                                            setPermissionSearch("");
                                            setDebouncedPermissionSearch("");
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              isSelected ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          <div className="flex min-w-0 flex-col">
                                            <span className="truncate">{permission.name}</span>
                                            {(permission.resourceGroup ||
                                              permission.resource) && (
                                                <span className="truncate text-xs text-muted-foreground">
                                                  {permission.resourceGroup || permission.resource}
                                                </span>
                                              )}
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )
                  ) : (
                    <div className="text-sm font-semibold text-foreground">
                      {entry.name}
                      {entry.department ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {entry.department}
                        </span>
                      ) : null}
                    </div>
                  )}
                </TableCell>

                {isEditing ? (
                  <TableCell className="w-[52px] text-right">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                      aria-label={`Remove ${entry.type.toLowerCase()} ${entry.name}`}
                      onClick={() => onRemoveEntry?.(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
