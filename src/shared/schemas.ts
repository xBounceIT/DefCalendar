import { z } from "zod";

const dateTimeStringSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Expected a parseable date-time string",
  });

const calendarViewSchema = z.enum(["dayGridMonth", "timeGridWeek", "timeGridDay"]);

const accountSummarySchema = z.object({
  homeAccountId: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  tenantId: z.string().nullable(),
  color: z.string(),
});

const storedAccountSchema = z.object({
  homeAccountId: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  tenantId: z.string().nullable(),
  color: z.string(),
  lastSignedInAt: dateTimeStringSchema,
});

const authStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("signed_out"),
    accounts: z.array(storedAccountSchema),
  }),
  z.object({
    status: z.literal("signed_in"),
    account: accountSummarySchema,
    accounts: z.array(storedAccountSchema),
    activeAccountId: z.string(),
  }),
]);

const authSignInModeSchema = z.enum(["user", "admin_consent"]);

const authSignInRequestSchema = z.object({
  mode: authSignInModeSchema.default("user"),
});

const calendarSummarySchema = z.object({
  id: z.string(),
  homeAccountId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  userColor: z.string().nullable().optional(),
  canEdit: z.boolean(),
  canShare: z.boolean(),
  isDefaultCalendar: z.boolean(),
  isVisible: z.boolean(),
  ownerName: z.string().nullable(),
  ownerAddress: z.string().nullable(),
});

const outlookCategorySchema = z.object({
  color: z.string(),
  displayName: z.string(),
});

const attendeeTypeSchema = z.enum(["required", "optional", "resource"]);

const participantResponseStatusSchema = z.object({
  response: z.string().nullable(),
  time: z.string().nullable(),
});

const eventParticipantSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  response: z.string().nullable(),
  type: attendeeTypeSchema.default("required"),
  status: participantResponseStatusSchema.nullable().optional(),
});

const eventAttachmentSchema = z.object({
  contentType: z.string().nullable(),
  id: z.string(),
  isInline: z.boolean(),
  name: z.string(),
  size: z.number().int().nonnegative(),
});

const onlineMeetingInfoSchema = z.object({
  conferenceId: z.string().nullable(),
  joinUrl: z.string().nullable(),
  phones: z.array(z.string()).default([]),
  provider: z.string().nullable(),
});

const recurrencePatternTypeSchema = z.enum([
  "daily",
  "weekly",
  "absoluteMonthly",
  "absoluteYearly",
]);
const recurrenceRangeTypeSchema = z.enum(["endDate", "noEnd", "numbered"]);
const dayOfWeekSchema = z.enum([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

const recurrenceSchema = z.object({
  pattern: z.object({
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    daysOfWeek: z.array(dayOfWeekSchema).default([]),
    firstDayOfWeek: dayOfWeekSchema.nullable().optional(),
    index: z.string().nullable().optional(),
    interval: z.number().int().min(1),
    month: z.number().int().min(1).max(12).nullable().optional(),
    type: recurrencePatternTypeSchema,
  }),
  range: z.object({
    endDate: z.string().nullable().optional(),
    numberOfOccurrences: z.number().int().min(1).nullable().optional(),
    recurrenceTimeZone: z.string().nullable().optional(),
    startDate: z.string().min(1),
    type: recurrenceRangeTypeSchema,
  }),
});

const bodyContentTypeSchema = z.enum(["text", "html"]);
const recurrenceEditScopeSchema = z.enum(["single", "series"]);
const availabilitySchema = z.enum([
  "free",
  "tentative",
  "busy",
  "oof",
  "workingElsewhere",
  "unknown",
]);
const sensitivitySchema = z.enum(["normal", "personal", "private", "confidential"]);
const eventResponseActionSchema = z.enum(["accept", "tentative", "decline"]);

const attachmentUploadSchema = z.object({
  contentBytes: z.string().min(1),
  contentType: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
});

const calendarEventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  subject: z.string(),
  body: z.string().nullable(),
  bodyContentType: bodyContentTypeSchema.default("html"),
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
  locations: z.array(z.object({ displayName: z.string().nullable() })).default([]),
  onlineMeeting: onlineMeetingInfoSchema.nullable().default(null),
  isOnlineMeeting: z.boolean().default(false),
  onlineMeetingProvider: z.string().nullable().optional(),
  recurrence: recurrenceSchema.nullable().default(null),
  seriesMasterId: z.string().nullable().optional(),
  occurrenceId: z.string().nullable().optional(),
  showAs: availabilitySchema.nullable().optional(),
  sensitivity: sensitivitySchema.nullable().optional(),
  allowNewTimeProposals: z.boolean().nullable().optional(),
  responseRequested: z.boolean().nullable().optional(),
  categories: z.array(z.string()).default([]),
  hasAttachments: z.boolean().default(false),
  attachments: z.array(eventAttachmentSchema).default([]),
  isOrganizer: z.boolean().default(true),
  responseStatus: participantResponseStatusSchema.nullable().optional(),
  cancelled: z.boolean().default(false),
  unsupportedReason: z.string().nullable(),
  lastModifiedDateTime: z.string().nullable(),
});

const eventDraftSchema = z
  .object({
    id: z.string().optional(),
    calendarId: z.string(),
    subject: z.string().trim().min(1, "Subject is required"),
    body: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    attendees: z.array(eventParticipantSchema).default([]),
    start: dateTimeStringSchema,
    end: dateTimeStringSchema,
    timeZone: z.string().min(1),
    isAllDay: z.boolean().default(false),
    isReminderOn: z.boolean().default(true),
    reminderMinutesBeforeStart: z.number().int().min(0).max(20_160).nullable().optional(),
    bodyContentType: bodyContentTypeSchema.default("html"),
    recurrence: recurrenceSchema.nullable().optional(),
    recurrenceEditScope: recurrenceEditScopeSchema.default("single"),
    isOnlineMeeting: z.boolean().default(false),
    showAs: availabilitySchema.default("busy"),
    sensitivity: sensitivitySchema.default("normal"),
    allowNewTimeProposals: z.boolean().default(true),
    responseRequested: z.boolean().default(true),
    categories: z.array(z.string()).default([]),
    attachmentsToAdd: z.array(attachmentUploadSchema).default([]),
    attachmentIdsToRemove: z.array(z.string()).default([]),
    etag: z.string().nullable().optional(),
    webLink: z.string().url().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (new Date(value.start).getTime() >= new Date(value.end).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Event end must be after the start",
        path: ["end"],
      });
    }

    const normalizedAttendees = new Set<string>();
    for (const [index, attendee] of value.attendees.entries()) {
      const normalizedEmail = attendee.email?.trim().toLowerCase();
      if (!normalizedEmail) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Attendee email is required",
          path: ["attendees", index, "email"],
        });
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Attendee email must be valid",
          path: ["attendees", index, "email"],
        });
      }

      if (normalizedAttendees.has(normalizedEmail)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate attendee email",
          path: ["attendees", index, "email"],
        });
      }
      normalizedAttendees.add(normalizedEmail);
    }

    if (value.isAllDay && value.recurrence?.range.recurrenceTimeZone === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "All-day recurring events must remain date-based.",
        path: ["recurrence"],
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
        message: "Range end must be after the start",
        path: ["end"],
      });
    }
  });

const setCalendarVisibilityArgsSchema = z.object({
  calendarId: z.string(),
  isVisible: z.boolean(),
});

const setCalendarColorArgsSchema = z.object({
  calendarId: z.string(),
  color: z.string(),
});

const listOutlookCategoriesArgsSchema = z.object({
  homeAccountId: z.string(),
});

const deleteEventArgsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
  etag: z.string().nullable().optional(),
});

const eventReferenceArgsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
});

const respondToEventArgsSchema = z.object({
  action: eventResponseActionSchema,
  calendarId: z.string(),
  comment: z.string().default(""),
  eventId: z.string(),
  sendResponse: z.boolean().default(true),
});

const cancelEventArgsSchema = z.object({
  calendarId: z.string(),
  comment: z.string().default(""),
  eventId: z.string(),
  etag: z.string().nullable().optional(),
});

const attachmentUploadArgsSchema = z.object({
  attachment: attachmentUploadSchema,
  calendarId: z.string(),
  eventId: z.string(),
});

const attachmentDeleteArgsSchema = z.object({
  attachmentId: z.string(),
  calendarId: z.string(),
  eventId: z.string(),
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

const reminderDialogItemSchema = z.object({
  dedupeKey: z.string().min(1),
  end: dateTimeStringSchema,
  isAllDay: z.boolean(),
  location: z.string().nullable(),
  onlineMeeting: onlineMeetingInfoSchema.nullable().default(null),
  reminderMinutesBeforeStart: z.number().int().min(0),
  reminderType: z.enum(["pre", "start"]).optional(),
  start: dateTimeStringSchema,
  subject: z.string(),
});

const syncStatusCountsSchema = z.object({
  calendars: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
});

const syncStatusSchema = z.object({
  state: z.enum(["idle", "syncing", "error"]),
  lastSyncedAt: z.string().nullable(),
  message: z.string().nullable(),
  messageKey: z.string().nullable().optional(),
  counts: syncStatusCountsSchema.nullable().optional(),
});

const appUpdateStateSchema = z.enum([
  "idle",
  "checking",
  "available",
  "not_available",
  "downloading",
  "downloaded",
  "error",
  "unsupported",
]);

const appUpdateStatusSchema = z.object({
  state: appUpdateStateSchema,
  currentVersion: z.string().min(1),
  latestVersion: z.string().nullable(),
  checkedAt: z.string().nullable(),
  downloadPercent: z.number().min(0).max(100).nullable(),
  releaseNotes: z.string().nullable(),
  error: z.string().nullable(),
});

const updateChannelSchema = z.enum(["stable", "prerelease"]);
const languageSettingSchema = z.enum(["system", "en", "it"]);
const timeFormatSettingSchema = z.enum(["system", "12h", "24h"]);
const localReminderWhenSchema = z.enum(["before", "after"]);
const localReminderRuleSchema = z.object({
  minutes: z.number().int().min(0).max(20_160),
  when: localReminderWhenSchema,
});
const syncIntervalMinutesSettingSchema = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

const languagePreferenceSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  languageSettingSchema.default("system"),
);

const timeFormatPreferenceSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  timeFormatSettingSchema.default("system"),
);

const syncIntervalMinutesPreferenceSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  syncIntervalMinutesSettingSchema.default(1),
);

const localReminderOverrideEnabledPreferenceSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.boolean().default(false),
);

const localReminderRulesPreferenceSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z
    .array(localReminderRuleSchema)
    .min(1)
    .max(10)
    .default([{ minutes: 15, when: "before" }]),
);

const reminderDialogStateSchema = z.object({
  items: z.array(reminderDialogItemSchema),
  locale: z.enum(["en", "it"]),
  timeFormat: timeFormatSettingSchema,
});

const userSettingsSchema = z.object({
  activeAccountId: z.string().nullable().optional(),
  visibleCalendarIds: z.array(z.string()),
  activeView: calendarViewSchema,
  selectedDate: dateTimeStringSchema,
  language: languagePreferenceSchema,
  timeFormat: timeFormatPreferenceSchema,
  syncIntervalMinutes: syncIntervalMinutesPreferenceSchema,
  localReminderOverrideEnabled: localReminderOverrideEnabledPreferenceSchema,
  localReminderRules: localReminderRulesPreferenceSchema,
  updateChannel: updateChannelSchema.default("stable"),
});

const userSettingsPatchSchema = userSettingsSchema.partial();

type CalendarView = z.infer<typeof calendarViewSchema>;
type AccountSummary = z.infer<typeof accountSummarySchema>;
type AuthState = z.infer<typeof authStateSchema>;
type StoredAccount = z.infer<typeof storedAccountSchema>;
type AuthSignInMode = z.infer<typeof authSignInModeSchema>;
type AuthSignInRequest = z.infer<typeof authSignInRequestSchema>;
type CalendarSummary = z.infer<typeof calendarSummarySchema>;
type OutlookCategory = z.infer<typeof outlookCategorySchema>;
type AttendeeType = z.infer<typeof attendeeTypeSchema>;
type ParticipantResponseStatus = z.infer<typeof participantResponseStatusSchema>;
type EventParticipant = z.infer<typeof eventParticipantSchema>;
type EventAttachment = z.infer<typeof eventAttachmentSchema>;
type OnlineMeetingInfo = z.infer<typeof onlineMeetingInfoSchema>;
type Recurrence = z.infer<typeof recurrenceSchema>;
type BodyContentType = z.infer<typeof bodyContentTypeSchema>;
type RecurrenceEditScope = z.infer<typeof recurrenceEditScopeSchema>;
type Availability = z.infer<typeof availabilitySchema>;
type Sensitivity = z.infer<typeof sensitivitySchema>;
type EventResponseAction = z.infer<typeof eventResponseActionSchema>;
type AttachmentUpload = z.infer<typeof attachmentUploadSchema>;
type CalendarEvent = z.infer<typeof calendarEventSchema>;
type EventDraft = z.infer<typeof eventDraftSchema>;
type EventListArgs = z.infer<typeof eventListArgsSchema>;
type SetCalendarVisibilityArgs = z.infer<typeof setCalendarVisibilityArgsSchema>;
type SetCalendarColorArgs = z.infer<typeof setCalendarColorArgsSchema>;
type ListOutlookCategoriesArgs = z.infer<typeof listOutlookCategoriesArgsSchema>;
type DeleteEventArgs = z.infer<typeof deleteEventArgsSchema>;
type EventReferenceArgs = z.infer<typeof eventReferenceArgsSchema>;
type RespondToEventArgs = z.infer<typeof respondToEventArgsSchema>;
type CancelEventArgs = z.infer<typeof cancelEventArgsSchema>;
type AttachmentUploadArgs = z.infer<typeof attachmentUploadArgsSchema>;
type AttachmentDeleteArgs = z.infer<typeof attachmentDeleteArgsSchema>;
type ReminderSnoozeArgs = z.infer<typeof reminderSnoozeArgsSchema>;
type ReminderDismissArgs = z.infer<typeof reminderDismissArgsSchema>;
type ReminderDialogItem = z.infer<typeof reminderDialogItemSchema>;
type ReminderDialogState = z.infer<typeof reminderDialogStateSchema>;
type SyncStatus = z.infer<typeof syncStatusSchema>;
type AppUpdateState = z.infer<typeof appUpdateStateSchema>;
type AppUpdateStatus = z.infer<typeof appUpdateStatusSchema>;
type LocalReminderWhen = z.infer<typeof localReminderWhenSchema>;
type LocalReminderRule = z.infer<typeof localReminderRuleSchema>;
type UserSettings = z.infer<typeof userSettingsSchema>;
type UserSettingsPatch = z.infer<typeof userSettingsPatchSchema>;
type UpdateChannel = z.infer<typeof updateChannelSchema>;

function createDefaultSettings(): UserSettings {
  return {
    activeAccountId: null,
    visibleCalendarIds: [],
    activeView: "timeGridWeek",
    selectedDate: new Date().toISOString(),
    language: "system",
    timeFormat: "system",
    syncIntervalMinutes: 1,
    localReminderOverrideEnabled: false,
    localReminderRules: [{ minutes: 15, when: "before" }],
    updateChannel: "stable",
  };
}

export {
  accountSummarySchema,
  authStateSchema,
  authSignInModeSchema,
  authSignInRequestSchema,
  storedAccountSchema,
  calendarEventSchema,
  calendarSummarySchema,
  outlookCategorySchema,
  calendarViewSchema,
  cancelEventArgsSchema,
  createDefaultSettings,
  deleteEventArgsSchema,
  eventReferenceArgsSchema,
  attachmentDeleteArgsSchema,
  attachmentUploadArgsSchema,
  attachmentUploadSchema,
  attendeeTypeSchema,
  availabilitySchema,
  bodyContentTypeSchema,
  dayOfWeekSchema,
  eventDraftSchema,
  eventAttachmentSchema,
  eventListArgsSchema,
  eventParticipantSchema,
  eventResponseActionSchema,
  openExternalArgsSchema,
  onlineMeetingInfoSchema,
  participantResponseStatusSchema,
  reminderDialogItemSchema,
  reminderDialogStateSchema,
  reminderDismissArgsSchema,
  reminderSnoozeArgsSchema,
  recurrenceEditScopeSchema,
  recurrencePatternTypeSchema,
  recurrenceRangeTypeSchema,
  recurrenceSchema,
  respondToEventArgsSchema,
  listOutlookCategoriesArgsSchema,
  setCalendarVisibilityArgsSchema,
  setCalendarColorArgsSchema,
  sensitivitySchema,
  appUpdateStateSchema,
  appUpdateStatusSchema,
  localReminderRuleSchema,
  localReminderWhenSchema,
  syncStatusSchema,
  updateChannelSchema,
  userSettingsPatchSchema,
  userSettingsSchema,
  type AccountSummary,
  type AttachmentDeleteArgs,
  type AttachmentUpload,
  type AttachmentUploadArgs,
  type AttendeeType,
  type AuthState,
  type AuthSignInMode,
  type AuthSignInRequest,
  type Availability,
  type BodyContentType,
  type CalendarEvent,
  type CalendarSummary,
  type CalendarView,
  type CancelEventArgs,
  type DeleteEventArgs,
  type EventAttachment,
  type ListOutlookCategoriesArgs,
  type LocalReminderRule,
  type LocalReminderWhen,
  type ReminderDismissArgs,
  type ReminderDialogItem,
  type ReminderDialogState,
  type ReminderSnoozeArgs,
  type EventDraft,
  type EventListArgs,
  type EventParticipant,
  type EventReferenceArgs,
  type EventResponseAction,
  type OnlineMeetingInfo,
  type ParticipantResponseStatus,
  type OutlookCategory,
  type Recurrence,
  type RecurrenceEditScope,
  type RespondToEventArgs,
  type SetCalendarVisibilityArgs,
  type SetCalendarColorArgs,
  type Sensitivity,
  type SyncStatus,
  type AppUpdateState,
  type AppUpdateStatus,
  type StoredAccount,
  type UpdateChannel,
  type UserSettings,
  type UserSettingsPatch,
};
