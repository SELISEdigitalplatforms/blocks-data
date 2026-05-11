import { Suspense, lazy } from "react"

const GraphQLPlayground = lazy(async () => {
  const m = await import("@/data-gateway/components/graphql-playground")
  return { default: m.GraphQLPlayground }
})

const DataGatewayPlaygroundPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center text-sm text-muted-foreground">
          Loading playground…
        </div>
      }
    >
      <GraphQLPlayground />
    </Suspense>
  )
}

export default DataGatewayPlaygroundPage
