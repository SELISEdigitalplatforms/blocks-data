import { FilterToolbar, useSortQueryParams } from "@/components/filter-toolbar";

import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useT } from "@seliseblocks/genesis-os/i18n";

type RolesFilter = {
  search: string;
};

export const useRolesFilterQueryParams = () => {
  const [queryParams, setQueryParams] = useQueryStates({
    page: parseAsInteger.withDefault(0),
    pageSize: parseAsInteger.withDefault(10),
    search: parseAsString.withDefault(""),
  });
  return { queryParams, setQueryParams };
};
export const useRolesSortQueryParams = () =>
  {
  return (useSortQueryParams({
    initial: {
      property: "Name",
      isDescending: false,
    },
  }));
};

export const RolesFilterToolBar = () => {
  const { t } = useT("data.idp.iam");
  const {
    queryParams: { search },
    setQueryParams,
  } = useRolesFilterQueryParams();

  const changeHandler = (key: string, value: string) => {
    setQueryParams((params) => ({ ...params, [key]: value, page: 0 }));
  };
  const resetHandler = () => {
    setQueryParams(null);
  };

  return (
    <FilterToolbar<RolesFilter>
      filters={[{ key: "search", type: "SearchInput", label: t("common:SEARCH") }]}
      values={{ search: search }}
      defaultValues={{ search: "" }}
      onChange={changeHandler}
      onReset={resetHandler}
    />
  );
};
