import { describe, expect, it } from "vitest";
import parseAttendeeSchedule from "../src/main/graph/attendee-availability";
import { attendeeAvailabilityArgsSchema } from "../src/shared/attendee-availability";

const start = Date.parse("2026-09-29T09:00:00Z");
const end = Date.parse("2026-09-29T10:00:00Z");
const email = "coworker@example.com";

function item(
  status: string,
  startTime = "2026-09-29T09:30:00.0000000",
  endTime = "2026-09-29T10:30:00.0000000",
) {
  return {
    status,
    start: { dateTime: startTime, timeZone: "UTC" },
    end: { dateTime: endTime, timeZone: "UTC" },
    subject: "Private meeting",
    location: "Private room",
  };
}

function parse(schedule: Record<string, unknown>) {
  return parseAttendeeSchedule({ scheduleId: email, ...schedule }, email, start, end);
}

describe("participant availability", () => {
  it("uses exact overlaps and never exposes private event details", () => {
    expect(parse({ scheduleItems: [item("busy")] })).toEqual({ email, status: "busy" });
    expect(
      parse({
        availabilityView: "222222222222",
        scheduleItems: [
          item("busy", "2026-09-29T08:00:00", "2026-09-29T09:00:00"),
          item("busy", "2026-09-29T10:00:00", "2026-09-29T11:00:00"),
        ],
      }),
    ).toEqual({ email, status: "free" });
  });

  it("detects a one-minute conflict without rounding the selected interval", () => {
    expect(
      parse({ scheduleItems: [item("busy", "2026-09-29T09:59:00", "2026-09-29T10:01:00")] }).status,
    ).toBe("busy");
  });

  it("preserves the most restrictive overlapping status", () => {
    expect(parse({ scheduleItems: [item("Tentative"), item("Busy"), item("oof")] }).status).toBe(
      "oof",
    );
    expect(parse({ scheduleItems: [item("workingElsewhere"), item("free")] }).status).toBe(
      "workingElsewhere",
    );
  });

  it("reads free/busy-only responses and distinguishes tentative reservations", () => {
    expect(parse({ availabilityView: "000000000000" }).status).toBe("free");
    expect(parse({ availabilityView: "001000000000", scheduleItems: [] }).status).toBe("tentative");
    expect(parse({ availabilityView: "000230000000" }).status).toBe("oof");
  });

  it.each([
    {},
    { error: { responseCode: "5009", message: "Unavailable" }, availabilityView: "000000000000" },
    { availabilityView: "" },
    { availabilityView: "00X" },
    { availabilityView: "000" },
    { scheduleItems: [item("unknown")] },
    { scheduleItems: [item("busy", "invalid")] },
    { scheduleItems: [item("busy", "2026-02-30T09:00:00", "2026-02-30T10:00:00")] },
    { scheduleItems: [item("busy", "2026-09-29T10:30:00", "2026-09-29T09:30:00")] },
    {
      scheduleItems: [
        { ...item("busy"), start: { dateTime: "2026-09-29T09:00:00", timeZone: "Europe/Rome" } },
      ],
    },
  ])("does not mistake missing, denied or malformed data for free time: %j", (schedule) => {
    expect(parse(schedule).status).toBe("unknown");
  });

  it("validates ranges and recipient addresses before contacting Graph", () => {
    const args = {
      calendarId: "calendar-1",
      emails: [" Coworker@Example.com "],
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    };
    expect(attendeeAvailabilityArgsSchema.parse(args).emails).toEqual([email]);
    expect(attendeeAvailabilityArgsSchema.safeParse({ ...args, end: args.start }).success).toBe(
      false,
    );
    expect(
      attendeeAvailabilityArgsSchema.safeParse({ ...args, end: "2026-11-30T09:00:00Z" }).success,
    ).toBe(false);
    expect(attendeeAvailabilityArgsSchema.safeParse({ ...args, emails: ["invalid"] }).success).toBe(
      false,
    );
    expect(attendeeAvailabilityArgsSchema.safeParse({ ...args, emails: [] }).success).toBe(false);
  });
});
