import { Menu } from "@/models/menu-models";
import { Database, HardDrive, Home, Package } from "lucide-react";

/** Sidebar: workspace overview and core services. */
export const navigationMenus: Menu[] = [
  {
    id: "overview-project",
    type: "menu",
    name: "Overview",
    path: "/app/dashboard",
    icon: Home,
  },
  {
    id: "separator-overview",
    type: "separator",
  },
  {
    id: "service-data-gateway",
    type: "menu",
    name: "Data Gateway",
    path: "/app/data-gateway",
    icon: Database,
  },
  {
    id: "service-storage",
    type: "menu",
    name: "Storage",
    path: "/app/storage",
    icon: HardDrive,
  },
  {
    id: "environments",
    type: "menu",
    name: "Environments",
    path: "/app/project/environments",
    icon: Package,
  },
];