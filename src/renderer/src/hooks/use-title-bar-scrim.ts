import type { ThemeSetting } from "@shared/schema-values";
import { useEffect } from "react";

function resolveIsDarkTheme(theme: ThemeSetting): boolean {
  if (theme === "dark") {
    return true;
  }

  if (theme === "light") {
    return false;
  }

  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
}

function useTitleBarScrim(active: boolean, theme: ThemeSetting): void {
  useEffect(() => {
    const applyScrim = () => {
      void globalThis.calendarApi?.window?.setTitleBarScrim({
        active,
        isDarkTheme: resolveIsDarkTheme(theme),
      });
    };

    applyScrim();

    if (theme !== "system") {
      return () => {
        void globalThis.calendarApi?.window?.setTitleBarScrim({
          active: false,
          isDarkTheme: resolveIsDarkTheme(theme),
        });
      };
    }

    const mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      applyScrim();
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      void globalThis.calendarApi?.window?.setTitleBarScrim({
        active: false,
        isDarkTheme: resolveIsDarkTheme(theme),
      });
    };
  }, [active, theme]);
}

export default useTitleBarScrim;
