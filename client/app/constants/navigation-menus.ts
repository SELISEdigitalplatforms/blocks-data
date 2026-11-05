import { Menu } from "@/models/menu-models";
import { Database, HardDrive, Home, Package } from "lucide-react";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_SHARED_MODULE = "data.shared";

/** Sidebar: workspace overview and core services. */
export const navigationMenus: Menu[] = [
  {
    id: "overview-project",
    type: "menu",
    get name() { return tStatic(DATA_SHARED_MODULE, "NAVIGATION_MENUS.OVERVIEW"); },
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
    get name() { return tStatic(DATA_SHARED_MODULE, "NAVIGATION_MENUS.DATA_GATEWAY"); },
    path: "/app/data-gateway",
    icon: Database,
  },
  {
    id: "service-storage",
    type: "menu",
    get name() { return tStatic(DATA_SHARED_MODULE, "NAVIGATION_MENUS.STORAGE"); },
    path: "/app/storage",
    icon: HardDrive,
  },
  {
    id: "environments",
    type: "menu",
    get name() { return tStatic(DATA_SHARED_MODULE, "NAVIGATION_MENUS.ENVIRONMENTS"); },
    path: "/app/project/environments",
    icon: Package,
  },
];