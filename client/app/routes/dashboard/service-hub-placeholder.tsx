import { Construction } from "lucide-react"

type ServiceHubPlaceholderProps = {
  title: string
  description?: string
}

const ServiceHubPlaceholder = ({ title, description }: ServiceHubPlaceholderProps) => {
  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {description ?? "This area is not wired in this build yet. Navigation matches the Blocks Cloud shell."}
        </p>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card py-16 text-muted-foreground">
        <Construction className="h-10 w-10" aria-hidden />
        <p className="text-sm font-medium text-foreground">Coming soon</p>
      </div>
    </main>
  )
}

export default ServiceHubPlaceholder
