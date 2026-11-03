import { Trash } from "@/storage/pages/trash/trash";
import { useT } from "@seliseblocks/genesis-os/i18n";

const StorageTrashPage = () => {
  const { t } = useT("data.console");
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">{t("STORAGE_TRASH_PAGE.TRASH")}</h1>
      <Trash />
    </main>
  );
};

export default StorageTrashPage;
