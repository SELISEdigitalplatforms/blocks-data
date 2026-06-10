import { Menu } from "@/models/menu-models";
import { Database, Folder, Globe, HardDrive, Home } from "lucide-react";

/** Sidebar: workspace overview and core services. */
export const navigationMenus: Menu[] = [
  {
    id: "workspace-label",
    type: "label",
    name: "WORKSPACE",
  },
  {
    id: "project-label",
    type: "label",
    name: "PROJECT",
    icon: Folder,
  },
  {
    id: "environment-label",
    type: "label",
    name: "ENVIRONMENT",
    icon: Globe,
  },
  {
    id: "workspace-overview",
    type: "menu",
    name: "Overview",
    path: "/dashboard",
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
  // {
  //   id: "people",
  //   type: "menu",
  //   name: "People",
  //   path: "/project-overview/people",
  //   icon: Users,
  // },
  // {
  //   id: "repositories",
  //   type: "menu",
  //   name: "Repositories",
  //   path: "/project-overview/repositories",
  //   icon: BookMinus,
  // },
  // {
  //   id: "settings",
  //   type: "menu",
  //   name: "Project Settings",
  //   path: "/project-overview/settings",
  //   icon: Settings,
  // },
];
