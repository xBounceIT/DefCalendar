import { z } from "zod";
import { availabilitySchema } from "./schemas";

const MAX_AVAILABILITY_RANGE_MS = 62 * 24 * 60 * 60 * 1000;
const AVAILABILITY_REQUEST_TIMEOUT_MS = 30_000;
const AVAILABILITY_RESPONSE_TIMEOUT_MS = AVAILABILITY_REQUEST_TIMEOUT_MS + 5000;
const attendeeEmailSchema = z.string().trim().toLowerCase().email();

const attendeeAvailabilityArgsSchema = z
  .object({
    calendarId: z.string().min(1),
    emails: z.array(attendeeEmailSchema).min(1).max(500),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
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
});

type AttendeeAvailabilityArgs = z.infer<typeof attendeeAvailabilityArgsSchema>;
type AttendeeAvailability = z.infer<typeof attendeeAvailabilitySchema>;

export {
  attendeeAvailabilityArgsSchema,
  attendeeAvailabilitySchema,
  attendeeEmailSchema,
  AVAILABILITY_REQUEST_TIMEOUT_MS,
  AVAILABILITY_RESPONSE_TIMEOUT_MS,
  MAX_AVAILABILITY_RANGE_MS,
  type AttendeeAvailabilityArgs,
  type AttendeeAvailability,
};
