import React, { createContext, useCallback, useState } from "react";
import { useLocation } from "react-router";
import useIsMobile from "@/hooks/use-is-mobile";

type SidebarContextValue = {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  closeWithoutPersist: () => void;
  isSidebarSubMenuOpen: boolean;
  toggleSidebarSubMenu: () => void;
  showSidebarSubMenu: () => void;
  subMenuId: string | null;
  updateSubMenuId: (id: string) => void;
  servicesSearchTerm: string;
  updateServicesSearchTerm: (term: string) => void;
};

const defaultContextValue: SidebarContextValue = {
  isSidebarOpen: false,
  toggleSidebar: () => undefined,
  closeSidebar: () => undefined,
  closeWithoutPersist: () => undefined,
  isSidebarSubMenuOpen: false,
  toggleSidebarSubMenu: () => undefined,
  showSidebarSubMenu: () => undefined,
  subMenuId: null,
  updateSubMenuId: () => undefined,
  servicesSearchTerm: "",
  updateServicesSearchTerm: () => undefined,
};

export const SidebarContext = createContext<SidebarContextValue>(defaultContextValue);

export function DashboardLayoutProvider({
  children,
  isOpen,
  isSubMenuOpen = false,
  storageKey = "sidebar-open",
  persist = false,
}: {
  children: React.ReactNode;
  isOpen: boolean;
  isSubMenuOpen?: boolean;
  storageKey?: string;
  persist?: boolean;
}) {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const [hasRestored, setHasRestored] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(isOpen);
  const [isSidebarSubMenuOpen, setIsSidebarSubMenuOpen] = useState(isSubMenuOpen);
  const [subMenuId, setSubMenuId] = useState<string | null>(() => localStorage.getItem("subMenuId"));
  const [servicesSearchTerm, setServicesSearchTerm] = useState("");

  // The layout state below follows isMobile / persist / pathname / isSidebarOpen. Each block runs
  // on the first render and whenever its inputs change, in the same order as the effects it
  // replaces, so the final state is the same but never paints a stale frame first.

  // Restore the persisted sidebar state once, the first time persistence is on.
  if (persist && !hasRestored) {
    setHasRestored(true);
    if (!isMobile) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        setIsSidebarOpen(JSON.parse(stored) as boolean);
      }
    } else {
      setIsSidebarOpen(false);
    }
  }

  const sidebarLayoutKey = `${isMobile}|${persist}`;
  const [appliedSidebarLayout, setAppliedSidebarLayout] = useState<string | null>(null);
  if (sidebarLayoutKey !== appliedSidebarLayout) {
    setAppliedSidebarLayout(sidebarLayoutKey);
    if (!persist) {
      setIsSidebarOpen(!isMobile);
    } else if (isMobile) {
      setIsSidebarOpen(false);
    }
  }

  const subMenuRouteKey = `${pathname}|${isMobile}`;
  const [appliedSubMenuRoute, setAppliedSubMenuRoute] = useState<string | null>(null);
  if (subMenuRouteKey !== appliedSubMenuRoute) {
    setAppliedSubMenuRoute(subMenuRouteKey);
    if (!isMobile && pathname.startsWith("/services")) {
      setIsSidebarSubMenuOpen(true);
    }
  }

  const subMenuSidebarKey = `${isSidebarOpen}|${isMobile}`;
  const [appliedSubMenuSidebar, setAppliedSubMenuSidebar] = useState<string | null>(null);
  if (subMenuSidebarKey !== appliedSubMenuSidebar) {
    setAppliedSubMenuSidebar(subMenuSidebarKey);
    if (isSidebarOpen && !isMobile) {
      setIsSidebarSubMenuOpen(false);
    }
  }

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const nextState = !prev;
      if (persist && !isMobile) {
        localStorage.setItem(storageKey, JSON.stringify(nextState));
      }
      if (nextState) {
        setIsSidebarSubMenuOpen(false);
      }
      return nextState;
    });
  }, [isMobile, persist, storageKey]);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    if (persist && !isMobile) {
      localStorage.setItem(storageKey, JSON.stringify(false));
    }
  }, [isMobile, persist, storageKey]);

  const closeWithoutPersist = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const toggleSidebarSubMenu = useCallback(() => {
    setIsSidebarSubMenuOpen((prev) => !prev);
  }, []);

  const showSidebarSubMenu = useCallback(() => {
    setIsSidebarSubMenuOpen(true);
  }, []);

  const updateSubMenuId = useCallback((id: string) => {
    localStorage.setItem("subMenuId", id);
    setSubMenuId(id);
    setServicesSearchTerm("");
  }, []);

  const updateServicesSearchTerm = useCallback((term: string) => {
    setServicesSearchTerm(term);
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        isSidebarOpen,
        toggleSidebar,
        closeSidebar,
        closeWithoutPersist,
        isSidebarSubMenuOpen,
        toggleSidebarSubMenu,
        showSidebarSubMenu,
        subMenuId,
        updateSubMenuId,
        servicesSearchTerm,
        updateServicesSearchTerm,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}