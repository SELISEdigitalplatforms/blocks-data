import { useEffect } from "react"
import { DataService } from "@/cross-modules/data-gateway/components/data-service"

const DataGatewaySchemasPage = () => {
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">Data Gateway</h1>
      <DataService />
    </main>
  )
}

export default DataGatewaySchemasPage
