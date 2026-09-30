import { z } from "zod";
import type { Availability } from "@shared/schemas";
import {
  AVAILABILITY_STATUS_PRIORITY as STATUS_PRIORITY,
  workingHoursSchema,
  type AttendeeAvailability,
} from "@shared/attendee-availability";
import windowsTimeZones from "@shared/windows-time-zones.json";

const graphTimeSchema = z.object({ dateTime: z.string(), timeZone: z.string() });
const utcDateTimeSchema = z.iso.datetime({ offset: true });
const scheduleSchema = z.object({
  scheduleId: z.string(),
  error: z.unknown().optional(),
  availabilityView: z.string().optional(),
  workingHours: z.unknown().optional(),
  scheduleItems: z
    .array(
      z.object({
        status: z.string(),
        start: graphTimeSchema,
        end: graphTimeSchema,
      }),
    )
    .optional(),
});

function graphUtcTime(value: z.infer<typeof graphTimeSchema>): number {
  if (value.timeZone.toUpperCase() !== "UTC") {
    return Number.NaN;
  }
  const dateTime = /Z$|[+-]\d{2}:\d{2}$/.test(value.dateTime)
    ? value.dateTime
    : `${value.dateTime}Z`;
  return utcDateTimeSchema.safeParse(dateTime).success ? Date.parse(dateTime) : Number.NaN;
}

function parseAttendeeSchedule(
  value: unknown,
  email: string,
  start: number,
  end: number,
  includeSchedule = false,
): AttendeeAvailability {
  const result: AttendeeAvailability = { email, status: "unknown" };
  const parsed = scheduleSchema.safeParse(value);
  if (!parsed.success || parsed.data.error) {
    return result;
  }
  const schedule = parsed.data;
  const workingHours = workingHoursSchema.safeParse(schedule.workingHours);
  if (workingHours.success) {
    const name = workingHours.data.timeZone.name;
    if (Object.hasOwn(windowsTimeZones, name)) {
      workingHours.data.timeZone.name = windowsTimeZones[name as keyof typeof windowsTimeZones];
    }
  }
  const slots: NonNullable<AttendeeAvailability["schedule"]>["slots"] = [];
  const finish = (status: Availability): AttendeeAvailability => ({
    email,
    status,
    ...(includeSchedule
      ? {
          ...(workingHours.success ? { workingHours: workingHours.data } : {}),
          schedule: {
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            slots,
          },
        }
      : {}),
  });
  if (schedule.scheduleItems?.length) {
    let status: Availability = "free";
    for (const item of schedule.scheduleItems) {
      const itemStart = graphUtcTime(item.start);
      const itemEnd = graphUtcTime(item.end);
      if (!Number.isFinite(itemStart) || !Number.isFinite(itemEnd) || itemEnd <= itemStart) {
        return result;
      }
      if (itemStart >= end || itemEnd <= start) {
        continue;
      }
      const itemStatus =
        STATUS_PRIORITY.find(
          (candidate) => candidate.toLowerCase() === item.status.toLowerCase(),
        ) ?? "unknown";
      slots.push({
        start: new Date(Math.max(start, itemStart)).toISOString(),
        end: new Date(Math.min(end, itemEnd)).toISOString(),
        status: itemStatus,
      });
      if (STATUS_PRIORITY.indexOf(itemStatus) > STATUS_PRIORITY.indexOf(status)) {
        status = itemStatus;
      }
    }
    return finish(status);
  }
  if (
    !schedule.availabilityView ||
    !/^[0-4]+$/.test(schedule.availabilityView) ||
    schedule.availabilityView.length < Math.ceil((end - start) / (5 * 60 * 1000))
  ) {
    return result;
  }
  const statuses: Availability[] = ["free", "tentative", "busy", "oof", "workingElsewhere"];
  const status = [...schedule.availabilityView]
    .slice(0, Math.ceil((end - start) / 300_000))
    .reduce<Availability>((current, slot, index) => {
      const candidate = statuses[Number(slot)];
      const slotStart = start + index * 300_000;
      const previous = slots.at(-1);
      if (previous?.status === candidate) {
        previous.end = new Date(Math.min(end, slotStart + 300_000)).toISOString();
      } else {
        slots.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(Math.min(end, slotStart + 300_000)).toISOString(),
          status: candidate,
        });
      }
      return STATUS_PRIORITY.indexOf(candidate) > STATUS_PRIORITY.indexOf(current)
        ? candidate
        : current;
    }, "free");
  return finish(status);
}

export default parseAttendeeSchedule;
