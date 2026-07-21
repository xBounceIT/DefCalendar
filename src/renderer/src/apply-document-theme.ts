import type { ThemeSetting } from "@shared/schema-values";
import { resolveVisualTheme, type VisualTheme } from "@shared/theme";

function applyDocumentTheme(preference: ThemeSetting): void | (() => void) {
  const apply = (visualTheme: VisualTheme): void => {
    document.documentElement.dataset.theme = visualTheme;
  };

  if (preference !== "system") {
    apply(resolveVisualTheme(preference, false));
    return;
  }

  const mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");
  apply(resolveVisualTheme("system", mediaQuery.matches));
  const handleChange = (event: MediaQueryListEvent) => {
    apply(resolveVisualTheme("system", event.matches));
  };
  mediaQuery.addEventListener("change", handleChange);
  return () => mediaQuery.removeEventListener("change", handleChange);
}

export { applyDocumentTheme };
