import { Badge } from "@/components/ui-kits/badge/badge";
import { cn } from "@/lib/utils";
import { Menu } from "@/models/menu-models";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router";

type MenuItemType = Extract<Menu, { type: "menu" }>;

const pathPrefix = (path: string) => path.split("?")[0] ?? path;

function ChildMenuItem({ menu }: { menu: MenuItemType }) {
  const { pathname } = useLocation();
  const isActiveMenu = pathname.startsWith(pathPrefix(menu.path));

  return (
    <Link
      to={menu.path}
      className={cn(
        "flex h-9 items-center px-3 py-1.5 text-sm transition-colors hover:text-foreground",
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
    "relative mx-1 flex h-9 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-sm text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground",
    isActiveMenu && "bg-primary/10 !text-primary",
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
          <div className="absolute right-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-l-full bg-primary shadow-[0_0_6px_rgba(14,165,233,0.5)]" />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn(baseClasses, "group")}>
      <div className="flex items-center gap-3">
        {menuItem.icon ? <menuItem.icon className="h-4 w-4" /> : null}
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
        <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 rounded-sm border border-border/40 bg-card px-2 py-1 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <span className="whitespace-nowrap">{menuItem.name}</span>
        </div>
      ) : null}
      {isSidebarOpen ? <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-40" /> : null}
      {isActiveMenu ? (
        <div className="absolute right-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-l-full bg-primary shadow-[0_0_6px_rgba(14,165,233,0.5)]" />
      ) : null}

      <div className="absolute left-full top-0 z-10 hidden w-56 flex-col rounded-sm border border-border/40 bg-card py-1.5 shadow-xl group-hover:flex group-hover:text-muted-foreground/60">
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
