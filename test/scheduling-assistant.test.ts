import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttendeeAvailability } from "../src/shared/attendee-availability";
import type { EventParticipant } from "../src/shared/schemas";
import { HALF_HOUR, getAvailabilityInRange } from "../src/renderer/src/meeting-planner";
import {
  getSchedulingWindow,
  getSchedulingSuggestions,
  getSchedulingDays,
  getSchedulingRuns,
  shiftSchedulingPeriod,
  getSchedulingSlots,
  getWorkingSlotChecker,
} from "../src/renderer/src/scheduling-assistant";

afterEach(() => vi.unstubAllEnvs());

const person = (email: string, type: EventParticipant["type"] = "required"): EventParticipant => ({
  email,
  type,
  name: email,
  response: null,
  status: null,
});

describe("scheduling periods", () => {
  it("keeps future selections outside the default day window without expanding it", () => {
    const defaultWindow = getSchedulingWindow("2026-09-30", "day");
    const end = new Date("2026-10-06T10:00:00").getTime();
    for (const date of ["2026-10-02T00:00:00", "2026-10-03T09:00:00"]) {
      expect(
        getSchedulingWindow("2026-09-30", "day", { start: new Date(date).getTime(), end }),
      ).toStrictEqual(defaultWindow);
    }
    expect(
      getSchedulingWindow("2026-09-30", "day", {
        start: new Date("2026-10-01T23:30:00").getTime(),
        end,
      }).end,
    ).toBe(new Date("2026-10-07T00:00:00").getTime());
  });

  it("extends day timelines to include long selections while keeping the availability range bounded", () => {
    expect.hasAssertions();
    vi.stubEnv("TZ", "Europe/Rome");
    const start = new Date("2026-09-30T23:00:00").getTime();
    const end = new Date("2026-10-04T02:00:00").getTime();
    const range = getSchedulingWindow("2026-09-30", "day", { start, end });
    expect(range.end).toBe(new Date("2026-10-05T00:00:00").getTime());
    expect(getSchedulingDays(range)).toHaveLength(5);
    const navigated = getSchedulingWindow("2026-10-01", "day", { start, end });
    expect(navigated.start).toBe(new Date("2026-10-01T00:00:00").getTime());
    expect(navigated.end).toBe(range.end);
    expect(getSchedulingDays(navigated)).toHaveLength(4);
    const long = getSchedulingWindow("2026-09-30", "day", {
      start,
      end: new Date("2027-09-30T02:00:00").getTime(),
    });
    expect(long.end - long.start).toBeLessThan(62 * 24 * 60 * 60 * 1000);
    expect(getSchedulingDays(long)).toHaveLength(61);
    expect(getSchedulingWindow("2026-10-05", "day", { start, end })).toStrictEqual(
      getSchedulingWindow("2026-10-05", "day"),
    );
  });

  it("matches exact interval availability for partial conflicts, overlap priorities and incomplete coverage", () => {
    const item = free("required@example.com");
    item.schedule = {
      start: "2026-09-30T09:15:00Z",
      end: "2026-09-30T14:15:00Z",
      slots: [
        { start: "2026-09-30T09:59:00Z", end: "2026-09-30T10:01:00Z", status: "busy" },
        { start: "2026-09-30T10:00:00Z", end: "2026-09-30T11:00:00Z", status: "oof" },
        { start: "2026-09-30T11:00:00Z", end: "2026-09-30T12:00:00Z", status: "workingElsewhere" },
        { start: "2026-09-30T12:01:00Z", end: "2026-09-30T12:02:00Z", status: "unknown" },
      ],
    };
    const start = time("09:00"),
      end = time("15:00");
    const slots = getSchedulingSlots(item, start, end);
    expect(slots).toEqual(
      Array.from({ length: slots.length }, (_, index) =>
        getAvailabilityInRange(item, start + index * HALF_HOUR, start + (index + 1) * HALF_HOUR),
      ),
    );
    expect(getSchedulingSlots(undefined, start, end)).toEqual(Array(12).fill("unknown"));
    expect(
      getSchedulingSuggestions({
        participants: [person(item.email)],
        availability: [item],
        start,
        end,
        duration: HALF_HOUR,
        workingHoursOnly: false,
      }),
    ).toEqual([time("11:00"), time("11:30"), time("12:30"), time("13:00"), time("13:30")]);
    expect(
      getSchedulingSuggestions({
        participants: [person(item.email)],
        availability: [item],
        start,
        end,
        duration: 15 * 60_000,
        workingHoursOnly: false,
      }),
    ).toContain(time("14:00"));
  });
  it("uses Monday through Sunday for weeks including the year boundary", () => {
    vi.stubEnv("TZ", "UTC");
    const range = getSchedulingWindow("2027-01-03", "week");
    expect(new Date(range.start).toISOString()).toBe("2026-12-28T00:00:00.000Z");
    expect(new Date(range.end).toISOString()).toBe("2027-01-04T00:00:00.000Z");
    expect(getSchedulingDays(range)).toHaveLength(7);
    expect(shiftSchedulingPeriod("2027-01-03", "week", 1).toISOString()).toBe(
      "2027-01-04T00:00:00.000Z",
    );
  });

  it.each([
    ["2028-02-29", 29],
    ["2026-02-28", 28],
    ["2026-04-30", 30],
    ["2026-12-31", 31],
  ])("shows every actual day of the month for %s", (date, count) => {
    vi.stubEnv("TZ", "UTC");
    const range = getSchedulingWindow(date, "month");
    expect(new Date(range.start).getDate()).toBe(1);
    expect(new Date(range.end).getDate()).toBe(1);
    expect(getSchedulingDays(range)).toHaveLength(count);
  });

  it("navigates months without skipping February from January 31", () => {
    vi.stubEnv("TZ", "UTC");
    expect(shiftSchedulingPeriod("2028-01-31", "month", 1).toISOString()).toBe(
      "2028-02-01T00:00:00.000Z",
    );
    expect(shiftSchedulingPeriod("2028-01-31", "month", -1).toISOString()).toBe(
      "2027-12-01T00:00:00.000Z",
    );
    expect(shiftSchedulingPeriod("2028-01-31", "day", 1).toISOString()).toBe(
      "2028-02-01T00:00:00.000Z",
    );
  });

  it.each([
    ["2026-03-29", 46],
    ["2026-10-25", 50],
  ])("keeps calendar days aligned across DST in week and month views for %s", (date, slots) => {
    vi.stubEnv("TZ", "Europe/Rome");
    for (const view of ["week", "month"] as const) {
      const range = getSchedulingWindow(date, view);
      const days = getSchedulingDays(range);
      expect(
        days.every(
          (day) => new Date(day.start).getHours() === 0 && new Date(day.end).getHours() === 0,
        ),
      ).toBe(true);
      const changed = days.find((day) => new Date(day.start).getDate() === Number(date.slice(-2)))!;
      expect((changed.end - changed.start) / HALF_HOUR).toBe(slots);
      expect(days.at(-1)!.end).toBe(range.end);
    }
  });

  it("merges only contiguous equal statuses, retaining gaps between suggested intervals", () => {
    expect(getSchedulingRuns([true, true, false, true])).toEqual([
      { status: true, from: 0, to: 2 },
      { status: false, from: 2, to: 3 },
      { status: true, from: 3, to: 4 },
    ]);
    expect(getSchedulingRuns([])).toEqual([]);
  });
});
const time = (value: string) => Date.parse(`2026-09-30T${value}:00Z`);
const free = (email: string): AttendeeAvailability => ({
  email,
  status: "free",
  schedule: { start: "2026-09-30T00:00:00Z", end: "2026-10-02T00:00:00Z", slots: [] },
});

describe("scheduling assistant suggestions", () => {
  it("skips suggestions for the organizer alone and resumes when another participant or room is added", () => {
    const organizer = person("organizer@example.com");
    const availability = [free(organizer.email!)];
    const args = {
      organizerEmail: " Organizer@Example.com ",
      availability,
      start: time("09:00"),
      end: time("10:00"),
      duration: HALF_HOUR,
      workingHoursOnly: false,
    };
    expect(getSchedulingSuggestions({ ...args, participants: [organizer] })).toEqual([]);
    expect(
      getSchedulingSuggestions({
        ...args,
        participants: [organizer, person("ORGANIZER@example.com"), person("")],
      }),
    ).toEqual([]);
    for (const type of ["required", "optional", "resource"] as const) {
      const other = person("other@example.com", type);
      expect(
        getSchedulingSuggestions({
          ...args,
          participants: [organizer, other],
          availability: [...availability, free(other.email!)],
        }),
      ).toEqual([time("09:00"), time("09:30")]);
    }
  });
  it("requires every mandatory participant and room to be free for the entire duration, ignoring optional conflicts", () => {
    const participants = [
      person("organizer@example.com"),
      person("required@example.com"),
      person("optional@example.com", "optional"),
      person("room@example.com", "resource"),
    ];
    const availability = participants.map((item) => free(item.email!));
    availability[1]!.schedule!.slots = [
      { start: "2026-09-30T10:59:00Z", end: "2026-09-30T11:01:00Z", status: "busy" },
    ];
    availability[2]!.schedule!.slots = [
      { start: "2026-09-30T09:00:00Z", end: "2026-09-30T18:00:00Z", status: "oof" },
    ];
    availability[3]!.schedule!.slots = [
      { start: "2026-09-30T12:00:00Z", end: "2026-09-30T12:30:00Z", status: "tentative" },
    ];
    expect(
      getSchedulingSuggestions({
        participants,
        availability,
        start: time("09:00"),
        end: time("13:30"),
        duration: 2 * HALF_HOUR,
        workingHoursOnly: false,
      }),
    ).toEqual([time("09:00"), time("09:30"), time("12:30")]);
  });

  it.each([
    undefined,
    { email: "required@example.com", status: "free" as const },
    {
      ...free("required@example.com"),
      schedule: {
        start: "2026-09-30T09:00:00Z",
        end: "2026-09-30T10:00:00Z",
        slots: [
          {
            start: "2026-09-30T09:00:00Z",
            end: "2026-09-30T10:00:00Z",
            status: "unknown" as const,
          },
        ],
      },
    },
  ])("never suggests unconfirmed or missing calendars", (item) => {
    expect(
      getSchedulingSuggestions({
        participants: [person("required@example.com")],
        availability: item ? [item] : [],
        start: time("09:00"),
        end: time("11:00"),
        duration: HALF_HOUR,
        workingHoursOnly: false,
      }),
    ).toEqual([]);
  });

  it("does not suggest times beyond schedule coverage or with no required participants", () => {
    const item = free("required@example.com");
    item.schedule!.end = "2026-09-30T10:00:00Z";
    const args = {
      participants: [person(item.email)],
      availability: [item],
      start: time("09:00"),
      end: time("11:00"),
      duration: 2 * HALF_HOUR,
      workingHoursOnly: false,
    };
    expect(getSchedulingSuggestions(args)).toEqual([time("09:00")]);
    expect(
      getSchedulingSuggestions({ ...args, participants: [person(item.email, "optional")] }),
    ).toEqual([]);
    expect(getSchedulingSuggestions({ ...args, duration: Number.NaN })).toEqual([]);
  });

  it("limits whole meetings to the stated weekday working hours and allows that filter to be disabled", () => {
    vi.stubEnv("TZ", "UTC");
    const args = {
      participants: [person("required@example.com"), person("optional@example.com", "optional")],
      availability: [free("required@example.com")],
      start: time("17:00"),
      end: time("19:00"),
      duration: 2 * HALF_HOUR,
      workingHoursOnly: true,
      organizerEmail: "required@example.com",
    };
    args.availability[0]!.workingHours = {
      daysOfWeek: ["wednesday"],
      startTime: "09:00:00",
      endTime: "18:00:00",
      timeZone: { name: "UTC" },
    };
    expect(getSchedulingSuggestions(args)).toEqual([time("17:00")]);
    expect(getSchedulingSuggestions({ ...args, workingHoursOnly: false })).toEqual([
      time("17:00"),
      time("17:30"),
      time("18:00"),
    ]);
  });

  it("uses the organizer's part-time weekend hours and timezone, including exact meeting ends", () => {
    vi.stubEnv("TZ", "Europe/Rome");
    const start = Date.parse("2026-10-03T14:00:00Z"),
      end = Date.parse("2026-10-03T18:00:00Z");
    const organizer = free("organizer@example.com"),
      other = free("other@example.com");
    for (const item of [organizer, other]) {
      item.schedule = {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        slots: [],
      };
    }
    organizer.workingHours = {
      daysOfWeek: ["saturday"],
      startTime: "08:15:00.0000000",
      endTime: "10:15:00.0000000",
      timeZone: { name: "America/Los_Angeles" },
    };
    other.workingHours = { ...organizer.workingHours, daysOfWeek: ["monday"] };
    const args = {
      participants: [person(organizer.email), person(other.email)],
      organizerEmail: " ORGANIZER@example.com ",
      availability: [organizer, other],
      start,
      end,
      duration: HALF_HOUR * 2,
      workingHoursOnly: true,
    };
    expect(getSchedulingSuggestions(args)).toEqual([
      Date.parse("2026-10-03T15:30:00Z"),
      Date.parse("2026-10-03T16:00:00Z"),
    ]);
    expect(getSchedulingSuggestions({ ...args, duration: 45 * 60_000 })).toContain(
      Date.parse("2026-10-03T16:30:00Z"),
    );
    expect(getSchedulingSuggestions({ ...args, organizerEmail: "missing@example.com" })).toEqual(
      [],
    );
    organizer.workingHours.timeZone.name = "Customized Time Zone";
    expect(getSchedulingSuggestions(args)).toEqual([]);
    expect(getSchedulingSuggestions({ ...args, workingHoursOnly: false })).toHaveLength(7);
  });

  it("keeps recurring hours aligned across DST and excludes gaps within a repeated clock hour", () => {
    const hours = {
      daysOfWeek: ["sunday" as const],
      startTime: "01:00:00",
      endTime: "02:15:00",
      timeZone: { name: "Europe/Rome" },
    };
    const check = getWorkingSlotChecker(hours);
    expect(check(Date.parse("2026-10-25T00:00:00Z"), Date.parse("2026-10-25T01:10:00Z"))).toBe(
      false,
    );
    expect(
      getWorkingSlotChecker({ ...hours, endTime: "03:00:00" })(
        Date.parse("2026-10-25T00:00:00Z"),
        Date.parse("2026-10-25T02:00:00Z"),
      ),
    ).toBe(true);
    const daytime = getWorkingSlotChecker({ ...hours, startTime: "08:00:00", endTime: "16:00:00" });
    expect(daytime(Date.parse("2026-03-29T06:00:00Z"))).toBe(true);
    expect(daytime(Date.parse("2026-10-25T07:00:00Z"))).toBe(true);
    const overnight = getWorkingSlotChecker({
      ...hours,
      daysOfWeek: ["saturday"],
      startTime: "22:00:00",
      endTime: "06:00:00",
    });
    expect(overnight(Date.parse("2026-10-24T23:00:00Z"), Date.parse("2026-10-25T02:00:00Z"))).toBe(
      true,
    );
    expect(overnight(Date.parse("2026-10-25T20:00:00Z"))).toBe(false);
  });

  it.each([
    ["2026-03-28", 94],
    ["2026-10-24", 98],
  ])("keeps both complete days across daylight-saving changes", (date, count) => {
    vi.stubEnv("TZ", "Europe/Rome");
    const range = getSchedulingWindow(date);
    expect((range.end - range.start) / HALF_HOUR).toBe(count);
    expect(new Date(range.end).getHours()).toBe(0);
  });
});
