import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const THEME_CHANGE_EVENT = "blocks-theme-change";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("theme") as Theme) || "system";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme);
    setThemeState(newTheme);
    applyTheme(newTheme);

    // Keep all hook consumers in sync within the same document.
    window.dispatchEvent(
      new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: newTheme }),
    );
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        applyTheme("system");
        setThemeState("system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<Theme>;
      if (!customEvent.detail) return;

      setThemeState(customEvent.detail);
      applyTheme(customEvent.detail);
    };

    // Sync theme changes across tabs/windows.
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "theme") return;
      const nextTheme = (event.newValue as Theme) || "system";
      setThemeState(nextTheme);
      applyTheme(nextTheme);
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return { theme, setTheme, resolvedTheme };
}
