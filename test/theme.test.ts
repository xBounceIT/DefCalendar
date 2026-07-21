import {
  getTitleBarColors,
  getTitleBarScrimColors,
  isDarkVisualTheme,
  resolveVisualTheme,
  visualThemeSchema,
} from "../src/shared/theme";
import { themeSettingSchema, userSettingsPatchSchema } from "../src/shared/schemas";
import { describe, expect, it } from "vitest";

describe("resolveVisualTheme", () => {
  it("resolves explicit preferences to themselves", () => {
    expect.hasAssertions();
    expect(resolveVisualTheme("light", true)).toBe("light");
    expect(resolveVisualTheme("dark", false)).toBe("dark");
    expect(resolveVisualTheme("blue-navy", false)).toBe("blue-navy");
  });

  it("resolves system preference from OS dark mode", () => {
    expect.hasAssertions();
    expect(resolveVisualTheme("system", true)).toBe("dark");
    expect(resolveVisualTheme("system", false)).toBe("light");
  });
});

describe("isDarkVisualTheme", () => {
  it("treats dark and blue-navy as dark themes", () => {
    expect.hasAssertions();
    expect(isDarkVisualTheme("dark")).toBe(true);
    expect(isDarkVisualTheme("blue-navy")).toBe(true);
    expect(isDarkVisualTheme("light")).toBe(false);
  });
});

describe("getTitleBarColors", () => {
  it("maps each visual theme to its chrome colors", () => {
    expect.hasAssertions();
    expect(getTitleBarColors("light")).toStrictEqual({
      color: "#f5f5f5",
      symbolColor: "#1a1a1a",
    });
    expect(getTitleBarColors("dark")).toStrictEqual({
      color: "#0b0b0b",
      symbolColor: "#ffffff",
    });
    expect(getTitleBarColors("blue-navy")).toStrictEqual({
      color: "#070d1c",
      symbolColor: "#ffffff",
    });
  });
});

describe("getTitleBarScrimColors", () => {
  it("uses opaque darkened chrome so Windows caption buttons match the blur", () => {
    expect.hasAssertions();
    expect(getTitleBarScrimColors("dark").color).toBe("#000000");
    expect(getTitleBarScrimColors("blue-navy").color).toBe("#040810");
    expect(getTitleBarScrimColors("light").color).toBe("#c8ced8");
  });
});

describe("visualThemeSchema", () => {
  it("accepts resolved visual themes only", () => {
    expect.hasAssertions();
    expect(visualThemeSchema.parse("dark")).toBe("dark");
    expect(visualThemeSchema.parse("blue-navy")).toBe("blue-navy");
    expect(() => visualThemeSchema.parse("system")).toThrow();
  });
});

describe("themeSettingSchema", () => {
  it("accepts blue-navy as a theme setting", () => {
    expect.hasAssertions();
    expect(themeSettingSchema.parse("blue-navy")).toBe("blue-navy");
  });

  it("preserves blue-navy in settings patches", () => {
    expect.hasAssertions();
    expect(userSettingsPatchSchema.parse({ theme: "blue-navy" })).toStrictEqual({
      theme: "blue-navy",
    });
  });
});
