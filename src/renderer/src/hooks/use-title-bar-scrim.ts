import type { ThemeSetting } from "@shared/schema-values";
import { resolveVisualTheme } from "@shared/theme";
import { useEffect } from "react";

function useTitleBarScrim(active: boolean, theme: ThemeSetting): void {
  useEffect(() => {
    const resolveTheme = () =>
      resolveVisualTheme(theme, globalThis.matchMedia("(prefers-color-scheme: dark)").matches);

    const applyScrim = () => {
      void globalThis.calendarApi?.window?.setTitleBarScrim({
        active,
        visualTheme: resolveTheme(),
      });
    };

    applyScrim();

    if (theme !== "system") {
      return () => {
        void globalThis.calendarApi?.window?.setTitleBarScrim({
          active: false,
          visualTheme: resolveTheme(),
        });
      };
    }

    const mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", applyScrim);

    return () => {
      mediaQuery.removeEventListener("change", applyScrim);
      void globalThis.calendarApi?.window?.setTitleBarScrim({
        active: false,
        visualTheme: resolveTheme(),
      });
    };
  }, [active, theme]);
}

export default useTitleBarScrim;
