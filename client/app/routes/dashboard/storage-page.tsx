import { StorageContentsWrapper } from "@/cross-modules/storage/pages/storage/storage-contents"

const StoragePage = () => {
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">Storage</h1>
      <StorageContentsWrapper />
    </main>
  )
}

export default StoragePage
