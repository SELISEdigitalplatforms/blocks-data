import { Menu } from "@/models/menu-models"
import {
  Package,
  Users,
  BookMinus,
  Settings,
  LineChart,
  Database,
  Gauge,
  Zap,
  HardDrive,
} from "lucide-react"

/** Sidebar: observability hub, data services, then project-scoped links under /project-overview. */
export const navigationMenus: Menu[] = [
  {
    id: "service-observability",
    type: "menu",
    name: "Observability",
    path: "/services/lmt",
    icon: LineChart,
    children: [
      {
        id: "service-observability__lmt",
        type: "menu",
        name: "LMT",
        path: "/services/lmt",
        icon: Zap,
      },
      {
        id: "service-observability__rate-limiter",
        type: "menu",
        name: "Rate limiter",
        path: "/services/rate-limiter",
        icon: Gauge,
      },
      {
        id: "service-observability__auth-logs",
        type: "menu",
        name: "Authentication logs",
        path: "/services/authentication/logs",
        icon: LineChart,
      },
    ],
  },
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
