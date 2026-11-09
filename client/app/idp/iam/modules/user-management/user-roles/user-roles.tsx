import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import { AddUserRole } from "./add-user-role";
import { useUserRoles } from "@blocks-idp/iam/hooks/use-user";
import { UserRolesList } from "./user-roles-list";
import { Button } from "@/components/ui-kits/button/button";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { IRole } from "@blocks-idp/iam/models/role";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UserRolesProps = {
  id: string;
  projectKey: string;
};

export const UserRoles = ({ id, projectKey }: UserRolesProps) => {
  const { t } = useT("data.idp.iam");
  const { isLoading, roles } = useUserRoles({ id, projectKey });

  // Local state for roles and removed roles
  const [localRoles, setLocalRoles] = useState<IRole[]>([]);
  const [removedRoleSlugs, setRemovedRoleSlugs] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Sync localRoles with fetched roles
  const [prevRoles, setPrevRoles] = useState<IRole[] | undefined>(undefined);
  if (prevRoles !== roles) {
    setPrevRoles(roles);
    setLocalRoles(roles);
    setRemovedRoleSlugs([]);
  }

  const onRemoveRole = (slug: string) => {
    setLocalRoles((prev) => prev.filter((role) => role.slug !== slug));
    setRemovedRoleSlugs((prev) => [...prev, slug]);
  };

  const onReset = () => {
    setLocalRoles(roles);
    setRemovedRoleSlugs([]);
  };

  const { deleteRoles } = useUserRoles({ id, projectKey });

  const onSave = async () => {
    if (!removedRoleSlugs.length) return;
    setIsSaving(true);
    try {
      const res = await deleteRoles(removedRoleSlugs);
      if (!res.isSuccess) {
        showErrorToast({ errors: res.errors });
      } else {
        showSuccessToast({ description: t("USER_ROLES.ROLES_UPDATED_SUCCESSFULLY") });
      }
    } catch (error) {
      if (isErrorWithErrors(error)) showErrorToast({ errors: error.errors });
      else showErrorToast({ errors: t("USER_ROLES.SOMETHING_WENT_WRONG") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("USER_ROLES.ROLES")}</CardTitle>
        <div className="flex gap-2">
          {!!removedRoleSlugs.length && (
            <>
              <Button variant="outline" onClick={onReset} disabled={isSaving}>
                {t("common:RESET")}
              </Button>
              <Button variant="outline" onClick={onSave} disabled={isSaving}>
                {isSaving ? t("USER_ROLES.SAVING") : t("common:SAVE")}
              </Button>
            </>
          )}
          <AddUserRole userId={id} projectKey={projectKey} />
        </div>
      </CardHeader>
      <CardContent>
        <UserRolesList
          roles={localRoles}
          isLoading={isLoading}
          userId={id}
          projectKey={projectKey}
          onRemoveRole={onRemoveRole}
        />
        {/* {!isLoading && roles.length > filter.pageSize && (
          <div className="flex items-center md:justify-end">
            <Pagination
              page={filter.page}
              onChange={onPageChangeHandler}
              totalCount={roles.length || 0}
              pageSizeOptions={[filter.pageSize]}
              pageSize={filter.pageSize}
            />
          </div>
        )} */}
      </CardContent>
    </Card>
  );
};
