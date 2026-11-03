

import { FilterToolbar, useSortQueryParams } from "@/components/filter-toolbar";
import { PERMISSION_SEVERITY_OPTIONS, RESOURCE_TYPE } from "@blocks-idp/iam/models/permission";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const usePermissionsFilterQuaryParams = () => {
  const [queryParams, setQueryParams] = useQueryStates({
    search: parseAsString.withDefault(""),
    isBuiltIn: parseAsString.withDefault(""),
    type: parseAsString.withDefault(""),
    page: parseAsInteger.withDefault(0),
    pageSize: parseAsInteger.withDefault(10),
    permissionSeverity: parseAsString.withDefault(""),
  });
  return { queryParams, setQueryParams };
};
export const usePermissionsSortQuaryParams = () =>
  {
  return (useSortQueryParams({ initial: { property: "Name", isDescending: false } }));
};

export function PermissionsFilterToolbar() {
  const { t } = useT("data.idp.iam");
  const { queryParams, setQueryParams } = usePermissionsFilterQuaryParams();

  const changeHandler = (key: string, value: unknown) => {
    setQueryParams((prev) => ({
      ...prev,
      [key]: value,
      page: 0,
    }));
  };

  const resetHandler = () => setQueryParams(null);

  return (
    <FilterToolbar
      filters={[
        { key: "search", type: "SearchInput", label: "label" },
        {
          key: "isBuiltIn",
          type: "Radio",
          label: t("PERMISSIONS_FILTER_TOOLBAR.SOURCE"),
          props: {
            options: [
              { label: t("PERMISSIONS_FILTER_TOOLBAR.BUILT_IN"), value: "yes" },
              { label: t("PERMISSIONS_FILTER_TOOLBAR.CUSTOM"), value: "no" },
            ],
          },
        },
        {
          key: "permissionSeverity",
          type: "Radio",
          label: t("PERMISSIONS_FILTER_TOOLBAR.SEVERITY"),
          props: {
            options: PERMISSION_SEVERITY_OPTIONS.map((option) => ({
              label: option.label,
              value: option.value.toString(),
            })),
          },
        },
        {
          key: "type",
          type: "Radio",
          label: t("common:TYPE"),
          props: { options: RESOURCE_TYPE },
        },
      ]}
      values={{
        search: queryParams.search,
        type: queryParams.type,
        isBuiltIn: queryParams.isBuiltIn,
        permissionSeverity: queryParams.permissionSeverity,
      }}
      defaultValues={{ search: "", isBuiltIn: "", type: "", permissionSeverity: "" }}
      onChange={changeHandler}
      onReset={resetHandler}
    />
  );
}
