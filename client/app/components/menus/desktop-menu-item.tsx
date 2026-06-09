import { Badge } from "@/components/ui-kits/badge/badge";
import { cn } from "@/lib/utils";
import { Menu } from "@/models/menu-models";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

type MenuItemType = Extract<Menu, { type: "menu" }>;

const pathPrefix = (path: string) => path.split("?")[0] ?? path;

function ChildMenuItem({ menu }: { menu: MenuItemType }) {
  const { pathname } = useLocation();
  const isActiveMenu = pathname.startsWith(pathPrefix(menu.path));

  return (
    <Link
      to={menu.path}
      className={cn(
        "flex h-10 items-center px-4 py-1.5 text-base transition-colors hover:text-[hsl(var(--high-emphasis))]",
        isActiveMenu && "!text-primary",
        menu.disabled && "pointer-events-none cursor-not-allowed opacity-50",
      )}
    >
      {menu.icon ? <menu.icon className="mr-2 h-5 w-5" /> : null}
      <span>{menu.name}</span>
    </Link>
  );
}

export function DesktopMenuItem({
  menu,
  isSidebarOpen,
}: {
  menu: Menu;
  isSidebarOpen: boolean;
}) {
  // Handle separator type
  if (menu.type === "separator") {
    return <div className="my-2 border-t border-[hsl(var(--low-emphasis))]" />;
  }

  // Handle label type
  if (menu.type === "label") {
    const { selectedProject } = useProjectStore();
    const projectName = selectedProject?.name || "Project";
    const environment = selectedProject?.environment || "Environment";

    let displayText = menu.name;
    if (menu.id === "project-label" && isSidebarOpen) {
      displayText = `PROJECT: ${projectName}`;
    } else if (menu.id === "environment-label" && isSidebarOpen) {
      displayText = `ENVIRONMENT: ${environment}`;
    }

    if (!isSidebarOpen) {
      return null;
    }

    return (
      <div
        className={cn(
          "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--low-emphasis))]",
          menu.id === "workspace-label" && "pt-4",
        )}
      >
        {menu.id === "environment-label" ? (
          <span className="flex items-center gap-2">
            <span>{displayText}</span>
            <span className="rounded-sm bg-[hsl(var(--blocks-primary-50))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--high-emphasis))]">
              {environment}
            </span>
          </span>
        ) : (
          displayText
        )}
      </div>
    );
  }

  // Handle menu type
  if (menu.type !== "menu") {
    return null;
  }

  const menuItem = menu as MenuItemType;
  const { pathname } = useLocation();
  const selectedProject = useProjectStore().selectedProject;
  const projectName = selectedProject?.name || "Project";
  const environment = selectedProject?.environment || "Environment";

  const isActiveMenu = useMemo(() => {
    const allPaths = [pathPrefix(menuItem.path)];
    if (menuItem.children) {
      menuItem.children.forEach((child) => {
        if (child.type === "menu") allPaths.push(pathPrefix(child.path));
      });
    }
    return allPaths.some((item) => pathname.startsWith(item));
  }, [menuItem.children, menuItem.path, pathname]);

  const hasChildren = Boolean(menuItem.children?.length);

  const baseClasses = cn(
    "relative flex h-10 cursor-pointer items-center gap-3 px-4 py-1.5 text-base text-[hsl(var(--low-emphasis))] hover:text-[hsl(var(--high-emphasis))]",
    isActiveMenu && "!text-primary",
  );

  if (!hasChildren) {
    return (
      <div className={cn(baseClasses, "group justify-between")}>
        <Link
          to={menuItem.path}
          className={cn(
            "flex items-center gap-3",
            menuItem.disabled && "pointer-events-none opacity-50",
          )}
        >
          {menuItem.icon ? <menuItem.icon className="h-5 w-5" /> : null}
          {isSidebarOpen ? (
            <span className="relative">
              {menuItem.name}
              {menuItem.badge ? (
                <Badge
                  variant="secondary"
                  className="absolute -top-2 left-full ml-1 h-4 px-1 text-[9px] font-semibold uppercase text-primary"
                >
                  {menuItem.badge}
                </Badge>
              ) : null}
            </span>
          ) : null}
        </Link>
        {!isSidebarOpen ? (
          <div className="pointer-events-none absolute left-full top-0 z-20 ml-2 min-w-max whitespace-nowrap rounded bg-gray-300 px-2 py-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
            {menuItem.name}
          </div>
        ) : null}
        {isActiveMenu ? (
          <div className="absolute right-0 top-2.5 h-5 w-1 rounded-lg bg-primary" />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn(baseClasses, "group")}>
      <div className="flex items-center gap-3">
        {menuItem.icon ? <menuItem.icon className="h-5 w-5" /> : null}
        {isSidebarOpen ? (
          <span className="relative">
            {menuItem.name}
            {menuItem.badge ? (
              <Badge
                variant="outline"
                className="absolute -top-2 left-full ml-1 h-4 px-1 text-[9px] font-semibold uppercase text-primary"
              >
                {menuItem.badge}
              </Badge>
            ) : null}
          </span>
        ) : null}
      </div>
      {!isSidebarOpen ? (
        <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded bg-gray-300 px-2 py-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
          <span className="whitespace-nowrap">{menuItem.name}</span>
        </div>
      ) : null}
      {isSidebarOpen ? <ChevronRight className="ml-auto h-4 w-4" /> : null}
      {isActiveMenu ? (
        <div className="absolute right-0 top-2.5 h-5 w-1 rounded-lg bg-primary" />
      ) : null}

      <div className="absolute left-full top-0 z-10 hidden w-64 flex-col rounded-sm border bg-background py-2 group-hover:flex group-hover:text-[hsl(var(--low-emphasis))]">
        {menuItem.children
          ?.filter(
            (subMenu): subMenu is MenuItemType =>
              subMenu.type === "menu" && !subMenu.disabled,
          )
          .map((subMenu) => (
            <ChildMenuItem key={subMenu.id} menu={subMenu} />
          ))}
      </div>
      <div className="absolute left-full top-0 hidden h-full w-1 bg-transparent group-hover:block" />
    </div>
  );
}
