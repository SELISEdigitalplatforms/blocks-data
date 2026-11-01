import { Suspense, lazy } from "react"
import { useT } from "@seliseblocks/genesis-os/i18n";

const GraphQLPlayground = lazy(async () => {
  const m = await import("@/data-gateway/components/graphql-playground")
  return { default: m.GraphQLPlayground }
})

const DataGatewayPlaygroundPage = () => {
  const { t } = useT("data.console");
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center text-sm text-muted-foreground">
          {t("DATA_GATEWAY_PLAYGROUND.LOADING_PLAYGROUND")}
        </div>
      }
    >
      <GraphQLPlayground />
    </Suspense>
  )
}

export default DataGatewayPlaygroundPage
