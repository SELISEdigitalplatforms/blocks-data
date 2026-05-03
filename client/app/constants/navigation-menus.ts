import { Menu } from "@/models/menu-models"
import { Package, Users, BookMinus, Settings, Database, HardDrive } from "lucide-react"

/** Sidebar: data services, then project-scoped links under /project-overview. */
export const navigationMenus: Menu[] = [
  {
    id: "service-data-gateway",
    type: "menu",
    name: "Data Gateway",
    path: "/services/data-gateway",
    icon: Database,
  },
  {
    id: "service-storage",
    type: "menu",
    name: "Storage",
    path: "/services/storage",
    icon: HardDrive,
  },
  {
    type: "separator",
    id: "separator-identity",
  },
  {
    id: "environments",
    type: "menu",
    name: "Environments",
    path: "/project-overview/environments",
    icon: Package,
  },
  {
    id: "people",
    type: "menu",
    name: "People",
    path: "/project-overview/people",
    icon: Users,
  },
  {
    id: "repositories",
    type: "menu",
    name: "Repositories",
    path: "/project-overview/repositories",
    icon: BookMinus,
  },
  {
    id: "settings",
    type: "menu",
    name: "Project Settings",
    path: "/project-overview/settings",
    icon: Settings,
  },
]
