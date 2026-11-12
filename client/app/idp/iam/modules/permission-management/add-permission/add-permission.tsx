
import { useProjectStore } from "@/store/use-project-store";
import { CreatePermissionPayload } from "@blocks-idp/iam/models/permission";
import { useAddPermission } from "@blocks-idp/iam/hooks/use-permission";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { PermissionForm } from "../permission-form";
import { PermissionFormSchemaType } from "../permission-form/utils";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useNavigate } from "react-router";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const AddPermission = () => {
  const { t } = useT("data.idp.iam");
  const navigate = useNavigate();
  const selectedTenantId = useProjectStore().selectedProject?.tenantId || "";

  const { isPending, mutateAsync } = useAddPermission();

  const onSubmit = async (data: PermissionFormSchemaType) => {
    try {
      const newPermission: CreatePermissionPayload = {
        ...data,
        type: +data.type,
        projectKey: selectedTenantId,
        isBuiltIn: false,
        dependentPermissions: +data.type === 2 ? data.dependentPermissions : [],
      };
      const res = await mutateAsync(newPermission);
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      showSuccessToast({ description: t("ADD_PERMISSION.PERMISSION_CREATED_SUCCESSFULLY") });
      navigate(`/services/iam?tab=permissions`);
    } catch (error) {
      if (isErrorWithErrors(error)) return showErrorToast({ errors: error.errors });
      showErrorToast({ errors: t("ADD_PERMISSION.SOMETHING_WENT_WRONG") });
    }
  };

  setBreadcrumbTitle("/services/iam/permission-detail", t("ADD_PERMISSION.PERMISSIONS"));
  setBreadcrumbTitle(`/services/iam/permission-detail/new`, t("ADD_PERMISSION.NEW"));

  return (
    <div className="px-4 pt-4 md:px-6 md:pt-6">
      <div className="hidden md:flex">
        <PageBreadcrumb breadcrumbIndex={3} />
      </div>
      <div className="mt-4 text-xl font-semibold">{t("ADD_PERMISSION.NEW_PERMISSION")}</div>
      <div className="mt-4">
        <PermissionForm onSave={onSubmit} isPending={isPending} />
      </div>
    </div>
  );
};
