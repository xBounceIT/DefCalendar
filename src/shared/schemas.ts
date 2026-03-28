import { z } from 'zod';

const dateTimeStringSchema = z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected a parseable date-time string',
});

const calendarViewSchema = z.enum(['dayGridMonth', 'timeGridWeek', 'timeGridDay']);

const accountSummarySchema = z.object({
  homeAccountId: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  tenantId: z.string().nullable(),
});

const authStateSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('signed_out'),
  }),
  z.object({
    status: z.literal('signed_in'),
    account: accountSummarySchema,
  }),
]);

const authSignInModeSchema = z.enum(['user', 'admin_consent']);

const authSignInRequestSchema = z.object({
  mode: authSignInModeSchema.default('user'),
});

const calendarSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  canEdit: z.boolean(),
  canShare: z.boolean(),
  isDefaultCalendar: z.boolean(),
  isVisible: z.boolean(),
  ownerName: z.string().nullable(),
  ownerAddress: z.string().nullable(),
});

const eventParticipantSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  response: z.string().nullable(),
});

const calendarEventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  subject: z.string(),
  body: z.string().nullable(),
  bodyPreview: z.string().nullable(),
  location: z.string().nullable(),
  start: dateTimeStringSchema,
  end: dateTimeStringSchema,
  timeZone: z.string(),
  isAllDay: z.boolean(),
  isReminderOn: z.boolean(),
  reminderMinutesBeforeStart: z.number().int().nullable(),
  webLink: z.string().url().nullable(),
  etag: z.string().nullable(),
  changeKey: z.string().nullable(),
  type: z.string().nullable(),
  attendees: z.array(eventParticipantSchema),
  organizer: eventParticipantSchema.nullable(),
  unsupportedReason: z.string().nullable(),
  lastModifiedDateTime: z.string().nullable(),
});

const eventDraftSchema = z
  .object({
    id: z.string().optional(),
    calendarId: z.string(),
    subject: z.string().trim().min(1, 'Subject is required'),
    body: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    start: dateTimeStringSchema,
    end: dateTimeStringSchema,
    timeZone: z.string().min(1),
    isAllDay: z.boolean().default(false),
    isReminderOn: z.boolean().default(true),
    reminderMinutesBeforeStart: z.number().int().min(0).max(20_160).nullable().optional(),
    etag: z.string().nullable().optional(),
    webLink: z.string().url().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (new Date(value.start).getTime() >= new Date(value.end).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Event end must be after the start',
        path: ['end'],
      });
    }
  });

const eventListArgsSchema = z
  .object({
    start: dateTimeStringSchema,
    end: dateTimeStringSchema,
    calendarIds: z.array(z.string()).optional(),
  })
  .superRefine((value, context) => {
    if (new Date(value.start).getTime() >= new Date(value.end).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Range end must be after the start',
        path: ['end'],
      });
    }
  });

const setCalendarVisibilityArgsSchema = z.object({
  calendarId: z.string(),
  isVisible: z.boolean(),
});

const deleteEventArgsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
  etag: z.string().nullable().optional(),
});

const openExternalArgsSchema = z.object({
  url: z.string().url(),
});

const reminderSnoozeArgsSchema = z.object({
  dedupeKey: z.string().min(1),
  minutes: z.number().int().min(1).max(20_160),
});

const reminderDismissArgsSchema = z.object({
  dedupeKey: z.string().min(1),
});

const syncStatusSchema = z.object({
  state: z.enum(['idle', 'syncing', 'error']),
  lastSyncedAt: z.string().nullable(),
  message: z.string().nullable(),
});

const userSettingsSchema = z.object({
  visibleCalendarIds: z.array(z.string()),
  activeView: calendarViewSchema,
  selectedDate: dateTimeStringSchema,
  language: z.enum(['en', 'it']).nullable().optional(),
});

const userSettingsPatchSchema = userSettingsSchema.partial();

type CalendarView = z.infer<typeof calendarViewSchema>;
type AccountSummary = z.infer<typeof accountSummarySchema>;
type AuthState = z.infer<typeof authStateSchema>;
type AuthSignInMode = z.infer<typeof authSignInModeSchema>;
type AuthSignInRequest = z.infer<typeof authSignInRequestSchema>;
type CalendarSummary = z.infer<typeof calendarSummarySchema>;
type EventParticipant = z.infer<typeof eventParticipantSchema>;
type CalendarEvent = z.infer<typeof calendarEventSchema>;
type EventDraft = z.infer<typeof eventDraftSchema>;
type EventListArgs = z.infer<typeof eventListArgsSchema>;
type SetCalendarVisibilityArgs = z.infer<typeof setCalendarVisibilityArgsSchema>;
type DeleteEventArgs = z.infer<typeof deleteEventArgsSchema>;
type ReminderSnoozeArgs = z.infer<typeof reminderSnoozeArgsSchema>;
type ReminderDismissArgs = z.infer<typeof reminderDismissArgsSchema>;
type SyncStatus = z.infer<typeof syncStatusSchema>;
type UserSettings = z.infer<typeof userSettingsSchema>;
type UserSettingsPatch = z.infer<typeof userSettingsPatchSchema>;

function createDefaultSettings(): UserSettings {
  return {
    visibleCalendarIds: [],
    activeView: 'timeGridWeek',
    selectedDate: new Date().toISOString(),
    language: null,
  };
}

export {
  accountSummarySchema,
  authStateSchema,
  authSignInModeSchema,
  authSignInRequestSchema,
  calendarEventSchema,
  calendarSummarySchema,
  calendarViewSchema,
  createDefaultSettings,
  deleteEventArgsSchema,
  eventDraftSchema,
  eventListArgsSchema,
  eventParticipantSchema,
  openExternalArgsSchema,
  reminderDismissArgsSchema,
  reminderSnoozeArgsSchema,
  setCalendarVisibilityArgsSchema,
  syncStatusSchema,
  userSettingsPatchSchema,
  userSettingsSchema,
  type AccountSummary,
  type AuthState,
  type AuthSignInMode,
  type AuthSignInRequest,
  type CalendarEvent,
  type CalendarSummary,
  type CalendarView,
  type DeleteEventArgs,
  type ReminderDismissArgs,
  type ReminderSnoozeArgs,
  type EventDraft,
  type EventListArgs,
  type EventParticipant,
  type SetCalendarVisibilityArgs,
  type SyncStatus,
  type UserSettings,
  type UserSettingsPatch,
};
