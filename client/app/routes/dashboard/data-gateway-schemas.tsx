import { useEffect } from "react"
import { DataService } from "@/cross-modules/data-gateway/components/data-service"

const DataGatewaySchemasPage = () => {
  // TODO: we will remove this later 
  useEffect(() => {
    fetch("https://dev-os.blocksdevelopers.com/ping")
      .then((res) => res.json())
      .then((data) => console.log(data))
      .catch((err) => console.error(err));
  }, []);

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">Data Gateway</h1>
      <DataService />
    </main>
  )
}

export default DataGatewaySchemasPage
