import { StorageSearch } from "@/storage/pages/search/search";
import { useT } from "@seliseblocks/genesis-os/i18n";

const StorageSearchPage = () => {
  const { t } = useT("data.console");
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">{t("STORAGE_SEARCH_PAGE.SEARCH_STORAGE")}</h1>
      <StorageSearch />
    </main>
  );
};

export default StorageSearchPage;
