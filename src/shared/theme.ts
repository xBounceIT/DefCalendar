import { z } from "zod";
import type { ThemeSetting } from "./schemas";

interface TitleBarColors {
  color: string;
  symbolColor: string;
}

const visualThemeSchema = z.enum(["light", "dark", "blue-navy"]);

type VisualTheme = z.infer<typeof visualThemeSchema>;

const TITLE_BAR_COLORS: Record<VisualTheme, TitleBarColors> = {
  light: { color: "#f5f5f5", symbolColor: "#1a1a1a" },
  dark: { color: "#0b0b0b", symbolColor: "#ffffff" },
  "blue-navy": { color: "#070d1c", symbolColor: "#ffffff" },
};

const TITLE_BAR_SCRIM_COLORS: Record<VisualTheme, TitleBarColors> = {
  light: { color: "#c8ced8", symbolColor: "rgba(26, 26, 26, 0.55)" },
  dark: { color: "#000000", symbolColor: "rgba(255, 255, 255, 0.55)" },
  "blue-navy": { color: "#040810", symbolColor: "rgba(255, 255, 255, 0.55)" },
};

function resolveVisualTheme(preference: ThemeSetting, prefersDark: boolean): VisualTheme {
  if (preference === "system") {
    return prefersDark ? "dark" : "light";
  }

  return preference;
}

function isDarkVisualTheme(visual: VisualTheme): boolean {
  return visual !== "light";
}

function getTitleBarColors(visual: VisualTheme): TitleBarColors {
  return TITLE_BAR_COLORS[visual];
}

function getTitleBarScrimColors(visual: VisualTheme): TitleBarColors {
  return TITLE_BAR_SCRIM_COLORS[visual];
}

export type { VisualTheme };
export {
  getTitleBarColors,
  getTitleBarScrimColors,
  isDarkVisualTheme,
  resolveVisualTheme,
  visualThemeSchema,
};
