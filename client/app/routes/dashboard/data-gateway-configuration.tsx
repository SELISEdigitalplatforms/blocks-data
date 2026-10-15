import { useOsSecretManagementUrl } from "@/hooks/use-scoped-path"
import { useEffect } from "react"

/**
 * The data-source config lives in Blocks OS. This route stays so old bookmarks of
 * `/data-gateway/configuration` land on the OS page instead of a 404.
 */
const DataGatewayConfigurationPage = () => {
  const osUrl = useOsSecretManagementUrl("data-gateway")

  useEffect(() => {
    window.location.replace(osUrl)
  }, [osUrl])

  return <p className="p-6 text-sm text-muted-foreground">Opening Blocks OS…</p>
}

export default DataGatewayConfigurationPage
