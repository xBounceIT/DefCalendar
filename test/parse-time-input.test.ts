import { describe, expect, it } from "vitest";
import { parseTimeInput } from "../src/renderer/src/components/event-editor-dialog";

describe(parseTimeInput, () => {
  describe("colon-separated forms", () => {
    it("parses canonical HH:MM", () => {
      expect(parseTimeInput("09:30")).toBe("09:30");
      expect(parseTimeInput("21:45")).toBe("21:45");
      expect(parseTimeInput("00:00")).toBe("00:00");
      expect(parseTimeInput("23:59")).toBe("23:59");
    });

    it("zero-pads single-digit hours and minutes", () => {
      expect(parseTimeInput("9:30")).toBe("09:30");
      expect(parseTimeInput("9:5")).toBe("09:50");
      expect(parseTimeInput("0:0")).toBe("00:00");
    });

    it("rejects hours > 23", () => {
      expect(parseTimeInput("24:00")).toBeNull();
      expect(parseTimeInput("99:00")).toBeNull();
    });

    it("rejects minutes > 59", () => {
      expect(parseTimeInput("10:60")).toBeNull();
      expect(parseTimeInput("10:99")).toBeNull();
    });
  });

  describe("digits-only compact forms", () => {
    it("parses 1- and 2-digit input as bare hour", () => {
      expect(parseTimeInput("9")).toBe("09:00");
      expect(parseTimeInput("21")).toBe("21:00");
      expect(parseTimeInput("0")).toBe("00:00");
    });

    it("parses 3-digit input as H:MM", () => {
      expect(parseTimeInput("930")).toBe("09:30");
      expect(parseTimeInput("105")).toBe("01:05");
    });

    it("parses 4-digit input as HH:MM", () => {
      expect(parseTimeInput("2130")).toBe("21:30");
      expect(parseTimeInput("0905")).toBe("09:05");
    });

    it("rejects 2-digit input that would yield invalid hours", () => {
      expect(parseTimeInput("24")).toBeNull();
      expect(parseTimeInput("99")).toBeNull();
    });

    it("rejects 4-digit input with invalid hours or minutes", () => {
      expect(parseTimeInput("2400")).toBeNull();
      expect(parseTimeInput("0960")).toBeNull();
    });

    it("rejects 3-digit input with invalid minutes", () => {
      expect(parseTimeInput("999")).toBeNull();
    });
  });

  describe("am/pm forms", () => {
    it("parses am with bare hours", () => {
      expect(parseTimeInput("9am")).toBe("09:00");
      expect(parseTimeInput("9 AM")).toBe("09:00");
      expect(parseTimeInput("1am")).toBe("01:00");
    });

    it("parses pm with bare hours", () => {
      expect(parseTimeInput("9pm")).toBe("21:00");
      expect(parseTimeInput("1pm")).toBe("13:00");
      expect(parseTimeInput("11 pm")).toBe("23:00");
    });

    it("parses am/pm with colon minutes", () => {
      expect(parseTimeInput("9:30am")).toBe("09:30");
      expect(parseTimeInput("9:30 AM")).toBe("09:30");
      expect(parseTimeInput("8:15 pm")).toBe("20:15");
    });

    it("handles the 12am/12pm boundary correctly", () => {
      expect(parseTimeInput("12am")).toBe("00:00");
      expect(parseTimeInput("12:00am")).toBe("00:00");
      expect(parseTimeInput("12:30am")).toBe("00:30");
      expect(parseTimeInput("12pm")).toBe("12:00");
      expect(parseTimeInput("12:30pm")).toBe("12:30");
    });

    it("rejects am/pm with out-of-range 12-hour values", () => {
      expect(parseTimeInput("0pm")).toBeNull();
      expect(parseTimeInput("13pm")).toBeNull();
      expect(parseTimeInput("0am")).toBeNull();
    });
  });

  describe("input normalization", () => {
    it("ignores leading and trailing whitespace", () => {
      expect(parseTimeInput("  9:30  ")).toBe("09:30");
      expect(parseTimeInput("\t21:00\n")).toBe("21:00");
    });

    it("is case-insensitive for am/pm", () => {
      expect(parseTimeInput("9AM")).toBe("09:00");
      expect(parseTimeInput("9Am")).toBe("09:00");
      expect(parseTimeInput("9pM")).toBe("21:00");
    });
  });

  describe("invalid input", () => {
    it("returns null for empty / whitespace-only input", () => {
      expect(parseTimeInput("")).toBeNull();
      expect(parseTimeInput("   ")).toBeNull();
    });

    it("returns null for non-numeric gibberish", () => {
      expect(parseTimeInput("abc")).toBeNull();
      expect(parseTimeInput("zzz")).toBeNull();
      expect(parseTimeInput("9:30:00")).toBeNull();
    });

    it("returns null when hours-only digits exceed 2 with colon", () => {
      // "100:30" — digits before colon must be 1-2
      expect(parseTimeInput("100:30")).toBeNull();
    });
  });
});
