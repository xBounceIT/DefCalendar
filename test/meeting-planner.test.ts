import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPlannerDay,
  getAvailabilityInRange,
  snapPlannerRange,
  movePlannerRange,
  HALF_HOUR,
} from "../src/renderer/src/meeting-planner";

afterEach(() => vi.unstubAllEnvs());

describe("meeting planning ranges", () => {
  it("preserves the second occurrence of an autumn clock-change slot through resizing and saving", () => {
    vi.stubEnv("TZ", "Europe/Rome");
    const target = Date.parse("2026-10-25T02:30:00+01:00");
    const range = movePlannerRange("2026-10-24T09:00", "2026-10-24T09:30", target);
    expect(range.startInput).toBe("2026-10-25T02:30+01:00");
    expect(new Date(snapPlannerRange(range.startInput, range.endInput).startInput).getTime()).toBe(
      target,
    );
  });
  it.each([
    ["2026-09-30T09:17", "2026-09-30T10:11", "2026-09-30T09:30", "2026-09-30T10:00"],
    ["2026-09-30T23:47", "2026-09-30T23:53", "2026-10-01T00:00", "2026-10-01T00:30"],
  ])(
    "snaps both boundaries and preserves a minimum half-hour duration",
    (start, end, expectedStart, expectedEnd) => {
      expect(snapPlannerRange(start, end)).toEqual({
        startInput: expectedStart,
        endInput: expectedEnd,
      });
    },
  );

  it("moves an off-grid event and rounds its duration up to half-hour steps across midnight", () => {
    const target = new Date("2026-09-30T23:30").getTime();
    expect(movePlannerRange("2026-09-30T09:17", "2026-09-30T10:02", target)).toEqual({
      startInput: "2026-09-30T23:30",
      endInput: "2026-10-01T00:30",
    });
  });

  it.each([
    ["2026-03-29", 46],
    ["2026-10-25", 50],
  ])("covers every real half hour of a daylight-saving day", (day, slots) => {
    vi.stubEnv("TZ", "Europe/Rome");
    const range = getPlannerDay(day);
    expect((range.end.getTime() - range.start.getTime()) / HALF_HOUR).toBe(slots);
  });

  it("detects exact partial conflicts and never claims missing or out-of-range data is free", () => {
    const item = {
      email: "coworker@example.com",
      status: "busy" as const,
      schedule: {
        start: "2026-09-30T00:00:00Z",
        end: "2026-10-01T00:00:00Z",
        slots: [
          { start: "2026-09-30T09:59:00Z", end: "2026-09-30T10:01:00Z", status: "busy" as const },
        ],
      },
    };
    expect(
      getAvailabilityInRange(
        item,
        Date.parse("2026-09-30T09:30:00Z"),
        Date.parse("2026-09-30T10:00:00Z"),
      ),
    ).toBe("busy");
    expect(
      getAvailabilityInRange(
        item,
        Date.parse("2026-09-30T10:01:00Z"),
        Date.parse("2026-09-30T10:30:00Z"),
      ),
    ).toBe("free");
    expect(
      getAvailabilityInRange(
        item,
        Date.parse("2026-10-01T10:00:00Z"),
        Date.parse("2026-10-01T10:30:00Z"),
      ),
    ).toBe("unknown");
    expect(getAvailabilityInRange(undefined, 0, 1)).toBe("unknown");
  });
});
