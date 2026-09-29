import { z } from "zod";
import type { Availability } from "@shared/schemas";
import type { AttendeeAvailability } from "@shared/attendee-availability";

const graphTimeSchema = z.object({ dateTime: z.string(), timeZone: z.string() });
const utcDateTimeSchema = z.iso.datetime({ offset: true });
const scheduleSchema = z.object({
  scheduleId: z.string(),
  error: z.unknown().optional(),
  availabilityView: z.string().optional(),
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

const STATUS_PRIORITY: Availability[] = [
  "free",
  "workingElsewhere",
  "unknown",
  "tentative",
  "busy",
  "oof",
];

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
): AttendeeAvailability {
  const result: AttendeeAvailability = { email, status: "unknown" };
  const parsed = scheduleSchema.safeParse(value);
  if (!parsed.success || parsed.data.error) {
    return result;
  }
  const schedule = parsed.data;
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
      if (STATUS_PRIORITY.indexOf(itemStatus) > STATUS_PRIORITY.indexOf(status)) {
        status = itemStatus;
      }
    }
    return { email, status };
  }
  if (
    !schedule.availabilityView ||
    !/^[0-4]+$/.test(schedule.availabilityView) ||
    schedule.availabilityView.length < Math.ceil((end - start) / (5 * 60 * 1000))
  ) {
    return result;
  }
  const statuses: Availability[] = ["free", "tentative", "busy", "oof", "workingElsewhere"];
  const status = [...schedule.availabilityView].reduce<Availability>((current, slot) => {
    const candidate = statuses[Number(slot)];
    return STATUS_PRIORITY.indexOf(candidate) > STATUS_PRIORITY.indexOf(current)
      ? candidate
      : current;
  }, "free");
  return { email, status };
}

export default parseAttendeeSchedule;
