import { StorageContentsWrapper } from "@/storage/pages/storage/storage-contents"
import { useT } from "@seliseblocks/genesis-os/i18n";

const StoragePage = () => {
  const { t } = useT("data.console");
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">{t("STORAGE_PAGE.STORAGE")}</h1>
      <StorageContentsWrapper />
    </main>
  )
}

export default StoragePage
