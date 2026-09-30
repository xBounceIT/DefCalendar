import { z } from "zod";
import { availabilitySchema, type Availability } from "./schemas";

const MAX_AVAILABILITY_RANGE_MS = 62 * 24 * 60 * 60 * 1000;
const AVAILABILITY_REQUEST_TIMEOUT_MS = 30_000;
const AVAILABILITY_RESPONSE_TIMEOUT_MS = AVAILABILITY_REQUEST_TIMEOUT_MS + 5000;
const AVAILABILITY_STATUS_PRIORITY: Availability[] = [
  "free",
  "workingElsewhere",
  "unknown",
  "tentative",
  "busy",
  "oof",
];
const attendeeEmailSchema = z.string().trim().toLowerCase().email();
const workingHoursSchema = z.object({
  daysOfWeek: z.array(
    z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]),
  ),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/),
  timeZone: z.object({ name: z.string().min(1) }),
});

const attendeeAvailabilityArgsSchema = z
  .object({
    calendarId: z.string().min(1),
    emails: z.array(attendeeEmailSchema).min(1).max(501),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    includeSchedule: z.boolean().optional(),
  })
  .refine(({ emails, includeSchedule }) => includeSchedule === true || emails.length <= 500, {
    message: "An availability check supports 500 recipients, plus the planner organizer.",
  })
  .refine(
    ({ start, end }) => {
      const duration = Date.parse(end) - Date.parse(start);
      return duration > 0 && duration < MAX_AVAILABILITY_RANGE_MS;
    },
    { message: "Availability requires a positive range shorter than 62 days." },
  );

const attendeeAvailabilitySchema = z.object({
  email: z.string().email(),
  status: availabilitySchema,
  error: z.literal("requestFailed").optional(),
  workingHours: workingHoursSchema.optional(),
  schedule: z
    .object({
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
      slots: z.array(
        z.object({
          start: z.iso.datetime({ offset: true }),
          end: z.iso.datetime({ offset: true }),
          status: availabilitySchema,
        }),
      ),
    })
    .optional(),
});

type AttendeeAvailabilityArgs = z.infer<typeof attendeeAvailabilityArgsSchema>;
type AttendeeAvailability = z.infer<typeof attendeeAvailabilitySchema>;
type WorkingHours = z.infer<typeof workingHoursSchema>;

export {
  attendeeAvailabilityArgsSchema,
  attendeeAvailabilitySchema,
  attendeeEmailSchema,
  workingHoursSchema,
  AVAILABILITY_REQUEST_TIMEOUT_MS,
  AVAILABILITY_RESPONSE_TIMEOUT_MS,
  AVAILABILITY_STATUS_PRIORITY,
  MAX_AVAILABILITY_RANGE_MS,
  type AttendeeAvailabilityArgs,
  type AttendeeAvailability,
  type WorkingHours,
};
