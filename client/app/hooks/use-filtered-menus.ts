import { useMemo } from "react"
import { useLocation } from "react-router-dom"
import { Menu } from "@/models/menu-models"

export function useFilteredMenus(menus: Menu[]): Menu[] {
  const { pathname } = useLocation()

  return useMemo(() => {
    const blockedMenu = import.meta.env.BLOCKS_BLOCKED_MENU || "[]"
    let parsedBlockedMenu: string[] = []
    const isProjectOverviewRoute = pathname.startsWith("/project-overview")
    const projectOverviewMenuIds = new Set([
      "environments",
      "people",
      "repositories",
      "settings",
    ])
    const nonProjectMenuIds = new Set(["service-data-gateway", "service-storage"])

    try {
      parsedBlockedMenu = JSON.parse(blockedMenu) as string[]
    } catch (error) {
      console.error("Failed to parse BLOCKS_BLOCKED_MENU:", error)
    }

    const filteredMenus = menus.filter((item) => {
      if (item.type === "separator") return true
      if (item.disabled) return false
      if (!isProjectOverviewRoute && projectOverviewMenuIds.has(item.id)) return false
      if (isProjectOverviewRoute && nonProjectMenuIds.has(item.id)) return false
      return !parsedBlockedMenu.includes(item.id)
    })

    const result = filteredMenus.filter((item, index) => {
      if (item.type !== "separator") return true

      const previousItem = filteredMenus[index - 1]
      const nextItem = filteredMenus[index + 1]
      if (!previousItem || !nextItem) return false
      if (previousItem.type === "separator" || nextItem.type === "separator") return false

      return true
    })

    return result
  }, [menus, pathname])
}
