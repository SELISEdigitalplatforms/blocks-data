import { Link } from "react-router-dom"
import { Button } from "@/components/ui-kits/button/button"
import { StorageContents } from "@/cross-modules/storage/pages/storage/storage-contents"

const StoragePage = () => {
  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold md:text-2xl">Storage</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/services/api-settings">API Docs</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/services/lmt">Logs</Link>
          </Button>
        </div>
      </div>
      <StorageContents />
    </main>
  )
}

export default StoragePage
