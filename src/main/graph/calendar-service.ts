import type {
  AttachmentUpload,
  CalendarEvent,
  CalendarSummary,
  EventAttachment,
  EventDraft,
  EventParticipant,
  OnlineMeetingInfo,
  OutlookCategory,
  ParticipantResponseStatus,
  Recurrence,
  RespondToEventArgs,
} from "@shared/schemas";
import type { AppConfig } from "@main/config";
import type MsalAuthService from "@main/auth/msal-auth-service";
import delay from "delay";

interface ParsedGraphCollection {
  nextLink?: string;
  value: unknown[];
}

interface GraphCalendar {
  canEdit?: boolean;
  canShare?: boolean;
  color?: null | string;
  hexColor?: null | string;
  id: string;
  isDefaultCalendar?: boolean;
  name?: string;
  owner?: {
    address?: string;
    name?: string;
  };
}

interface GraphDateTimeTimeZone {
  dateTime: string;
  timeZone?: string;
}

interface GraphRecipient {
  emailAddress?: {
    address?: string;
    name?: string;
  };
}

interface GraphAttendee extends GraphRecipient {
  status?: {
    response?: string;
    time?: string;
  };
  type?: string;
}

interface GraphBody {
  content?: string;
  contentType?: string;
}

interface GraphLocation {
  displayName?: string;
}

interface GraphOnlineMeeting {
  conferenceId?: string;
  joinUrl?: string;
  phones?: { number?: string }[];
}

interface GraphRecurrence {
  pattern?: {
    dayOfMonth?: number;
    daysOfWeek?: string[];
    firstDayOfWeek?: string;
    index?: string;
    interval?: number;
    month?: number;
    type?: string;
  };
  range?: {
    endDate?: string;
    numberOfOccurrences?: number;
    recurrenceTimeZone?: string;
    startDate?: string;
    type?: string;
  };
}

interface GraphResponseStatus {
  response?: string;
  time?: string;
}

interface GraphEvent {
  "@odata.etag"?: string;
  allowNewTimeProposals?: boolean;
  attendees?: GraphAttendee[];
  body?: GraphBody;
  bodyPreview?: string;
  categories?: string[];
  changeKey?: string;
  end?: GraphDateTimeTimeZone;
  hasAttachments?: boolean;
  id: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  isOrganizer?: boolean;
  isReminderOn?: boolean;
  lastModifiedDateTime?: string;
  location?: GraphLocation;
  locations?: GraphLocation[];
  onlineMeeting?: GraphOnlineMeeting;
  onlineMeetingProvider?: string;
  organizer?: GraphRecipient;
  originalStart?: string;
  recurrence?: GraphRecurrence;
  reminderMinutesBeforeStart?: number;
  responseRequested?: boolean;
  responseStatus?: GraphResponseStatus;
  sensitivity?: string;
  seriesMasterId?: string;
  showAs?: string;
  start?: GraphDateTimeTimeZone;
  subject?: string;
  type?: string;
  webLink?: string;
}

interface SendRequestArgs {
  forceRefresh?: boolean;
  homeAccountId?: string;
  init?: RequestInit;
  pathOrUrl: string;
  retryCount?: number;
}

const EVENT_SELECT =
  "id,subject,body,bodyPreview,location,locations,start,end,isAllDay,isReminderOn,reminderMinutesBeforeStart,webLink,changeKey,type,attendees,organizer,recurrence,onlineMeeting,onlineMeetingProvider,isOnlineMeeting,lastModifiedDateTime,allowNewTimeProposals,responseRequested,showAs,sensitivity,categories,seriesMasterId,responseStatus,hasAttachments,isOrganizer,isCancelled,originalStart";

class GraphCalendarService {
  private readonly auth: MsalAuthService;
  private readonly baseUrl = "https://graph.microsoft.com/v1.0";
  private readonly config: AppConfig;

  constructor(auth: MsalAuthService, config: AppConfig) {
    this.auth = auth;
    this.config = config;
  }

  async listCalendars(homeAccountId: string): Promise<CalendarSummary[]> {
    const response = await this.paginate(
      "/me/calendars?$select=id,name,color,hexColor,canEdit,canShare,isDefaultCalendar,owner",
      parseGraphCalendar,
      homeAccountId,
    );

    return response.map((calendar) => {
      let color = calendar.color ?? null;
      if (calendar.hexColor !== undefined) {
        color = calendar.hexColor;
      }

      return {
        canEdit: Boolean(calendar.canEdit),
        canShare: Boolean(calendar.canShare),
        color,
        homeAccountId,
        id: calendar.id,
        isDefaultCalendar: Boolean(calendar.isDefaultCalendar),
        isVisible: true,
        name: calendar.name ?? "Untitled calendar",
        ownerAddress: calendar.owner?.address ?? null,
        ownerName: calendar.owner?.name ?? null,
      };
    });
  }

  async listOutlookCategories(homeAccountId: string): Promise<OutlookCategory[]> {
    const categories = await this.paginate(
      "/me/outlook/masterCategories?$select=displayName,color",
      parseGraphOutlookCategory,
      homeAccountId,
    );

    return categories.toSorted((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async listCalendarView(
    calendarId: string,
    rangeStart: string,
    rangeEnd: string,
    homeAccountId: string,
  ): Promise<CalendarEvent[]> {
    const query = new URLSearchParams({
      $select: EVENT_SELECT,
      $top: "250",
      endDateTime: rangeEnd,
      startDateTime: rangeStart,
    });

    const response = await this.paginate(
      `/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${query.toString()}`,
      parseGraphEvent,
      homeAccountId,
    );

    return response.map((event) => this.toCalendarEvent(event, calendarId, homeAccountId));
  }

  async createEvent(draft: EventDraft, homeAccountId: string): Promise<CalendarEvent> {
    const response = parseGraphEvent(
      await this.requestJson(
        `/me/calendars/${encodeURIComponent(draft.calendarId)}/events`,
        {
          body: JSON.stringify(this.toGraphEventPayload(draft, "create")),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
        homeAccountId,
      ),
    );

    await this.syncAttachmentOperations(draft.calendarId, response.id, draft, homeAccountId);
    return this.getEvent(draft.calendarId, response.id, homeAccountId);
  }

  async updateEvent(draft: EventDraft, homeAccountId: string): Promise<CalendarEvent> {
    if (!draft.id) {
      throw new Error("Event id is required for updates.");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (draft.etag) {
      headers["If-Match"] = draft.etag;
    }

    await this.requestJson(
      `/me/calendars/${encodeURIComponent(draft.calendarId)}/events/${encodeURIComponent(draft.id)}`,
      {
        body: JSON.stringify(this.toGraphEventPayload(draft, "update")),
        headers,
        method: "PATCH",
      },
      homeAccountId,
    );

    await this.syncAttachmentOperations(draft.calendarId, draft.id, draft, homeAccountId);
    return this.getEvent(draft.calendarId, draft.id, homeAccountId);
  }

  async getEvent(
    calendarId: string,
    eventId: string,
    homeAccountId: string,
  ): Promise<CalendarEvent> {
    const query = new URLSearchParams({
      $select: EVENT_SELECT,
    });

    const response = parseGraphEvent(
      await this.requestJson(
        `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${query.toString()}`,
        {},
        homeAccountId,
      ),
    );

    return this.toCalendarEvent(response, calendarId, homeAccountId);
  }

  async deleteEvent(
    calendarId: string,
    eventId: string,
    homeAccountId: string,
    etag?: null | string,
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (etag) {
      headers["If-Match"] = etag;
    }

    await this.requestNoContent(
      `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        headers,
        method: "DELETE",
      },
      homeAccountId,
    );
  }

  async cancelEvent(
    calendarId: string,
    eventId: string,
    homeAccountId: string,
    comment = "",
  ): Promise<void> {
    await this.requestNoContent(
      `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/cancel`,
      {
        body: JSON.stringify({ Comment: comment }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      homeAccountId,
    );
  }

  async respondToEvent(args: RespondToEventArgs, homeAccountId: string): Promise<void> {
    await this.requestNoContent(
      `/me/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.eventId)}/${args.action}`,
      {
        body: JSON.stringify({
          comment: args.comment,
          sendResponse: args.sendResponse,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      homeAccountId,
    );
  }

  async listAttachments(
    calendarId: string,
    eventId: string,
    homeAccountId: string,
  ): Promise<EventAttachment[]> {
    const query = new URLSearchParams({
      $select: "id,name,contentType,size,isInline",
    });
    const response = parseGraphCollection(
      await this.requestJson(
        `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/attachments?${query.toString()}`,
        {},
        homeAccountId,
      ),
    );

    return response.value.map(parseGraphAttachment);
  }

  async addAttachment(
    calendarId: string,
    eventId: string,
    attachment: AttachmentUpload,
    homeAccountId: string,
  ): Promise<EventAttachment[]> {
    await this.requestJson(
      `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/attachments`,
      {
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          contentBytes: attachment.contentBytes,
          contentType: attachment.contentType,
          name: attachment.name,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      homeAccountId,
    );

    return this.listAttachments(calendarId, eventId, homeAccountId);
  }

  async removeAttachment(
    calendarId: string,
    eventId: string,
    attachmentId: string,
    homeAccountId: string,
  ): Promise<EventAttachment[]> {
    await this.requestNoContent(
      `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/attachments/${encodeURIComponent(attachmentId)}`,
      {
        method: "DELETE",
      },
      homeAccountId,
    );

    return this.listAttachments(calendarId, eventId, homeAccountId);
  }

  private async syncAttachmentOperations(
    calendarId: string,
    eventId: string,
    draft: EventDraft,
    homeAccountId: string,
  ): Promise<void> {
    for (const attachmentId of draft.attachmentIdsToRemove) {
      await this.removeAttachment(calendarId, eventId, attachmentId, homeAccountId);
    }

    for (const attachment of draft.attachmentsToAdd) {
      await this.addAttachment(calendarId, eventId, attachment, homeAccountId);
    }
  }

  private async paginate<TItem>(
    pathOrUrl: string,
    parseItem: (value: unknown) => TItem,
    homeAccountId: string,
  ): Promise<TItem[]> {
    const items: TItem[] = [];
    let nextUrl: string | undefined = pathOrUrl;

    while (nextUrl) {
      const response = parseGraphCollection(await this.requestJson(nextUrl, {}, homeAccountId));
      items.push(...response.value.map(parseItem));
      nextUrl = response.nextLink;
    }

    return items;
  }

  private async requestJson(
    pathOrUrl: string,
    init: RequestInit = {},
    homeAccountId?: string,
  ): Promise<unknown> {
    const response = await this.sendRequest({ homeAccountId, init, pathOrUrl });
    if (!response.ok) {
      throw new Error(await this.getErrorMessage(response));
    }

    return response.json();
  }

  private async requestNoContent(
    pathOrUrl: string,
    init: RequestInit = {},
    homeAccountId?: string,
  ): Promise<void> {
    const response = await this.sendRequest({ homeAccountId, init, pathOrUrl });
    if (!response.ok) {
      throw new Error(await this.getErrorMessage(response));
    }

    if (response.status !== 204 && response.status !== 202) {
      await response.arrayBuffer();
    }
  }

  private async sendRequest(args: SendRequestArgs): Promise<Response> {
    const { forceRefresh = false, homeAccountId, init = {}, pathOrUrl, retryCount = 0 } = args;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const accessToken = homeAccountId
      ? await this.auth.getAccessTokenForAccount(homeAccountId, forceRefresh)
      : await this.auth.getAccessToken(forceRefresh);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Prefer", `outlook.timezone="${this.config.timeZone}"`);

    let requestUrl = `${this.baseUrl}${pathOrUrl}`;
    if (pathOrUrl.startsWith("http")) {
      requestUrl = pathOrUrl;
    }

    const response = await fetch(requestUrl, {
      ...init,
      headers,
    });

    if (response.status === 401 && !forceRefresh) {
      return this.sendRequest({
        forceRefresh: true,
        homeAccountId,
        init,
        pathOrUrl,
        retryCount,
      });
    }

    const shouldRetry = (response.status === 429 || response.status === 503) && retryCount < 3;
    if (shouldRetry) {
      await delay(this.getRetryDelay(response.headers.get("Retry-After"), retryCount));
      return this.sendRequest({
        forceRefresh,
        homeAccountId,
        init,
        pathOrUrl,
        retryCount: retryCount + 1,
      });
    }

    return response;
  }

  private async getErrorMessage(response: Response): Promise<string> {
    const defaultMessage = `Microsoft Graph request failed with ${response.status}.`;

    try {
      const body = await response.json();
      const graphMessage = readGraphErrorMessage(body);
      if (graphMessage) {
        return graphMessage;
      }
    } catch {
      const text = await response.text();
      if (text) {
        return text;
      }
    }

    return defaultMessage;
  }

  private getRetryDelay(retryAfter: null | string, retryCount: number): number {
    if (retryAfter) {
      const seconds = Number.parseInt(retryAfter, 10);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
    }

    return (retryCount + 1) * 1500;
  }

  private toCalendarEvent(
    event: GraphEvent,
    calendarId: string,
    homeAccountId: string,
  ): CalendarEvent {
    const currentEmail = this.auth.getAccountUsername(homeAccountId)?.toLowerCase() ?? null;
    const organizer = event.organizer ? toParticipant(event.organizer) : null;
    const organizerEmail = organizer?.email?.toLowerCase() ?? null;
    const isOrganizer =
      event.isOrganizer ?? (currentEmail !== null && organizerEmail === currentEmail);

    return {
      allowNewTimeProposals: event.allowNewTimeProposals ?? null,
      attendees: (event.attendees ?? []).map(toParticipant),
      attachments: [],
      body: event.body?.content ?? null,
      bodyContentType: event.body?.contentType?.toLowerCase() === "text" ? "text" : "html",
      bodyPreview: trimOrNull(event.bodyPreview) ?? trimOrNull(stripHtml(event.body?.content)),
      calendarId,
      cancelled: Boolean(event.isCancelled),
      categories: event.categories ?? [],
      changeKey: event.changeKey ?? null,
      end: normalizeGraphDateTime(event.end?.dateTime),
      etag: event["@odata.etag"] ?? null,
      hasAttachments: Boolean(event.hasAttachments),
      id: event.id,
      isAllDay: Boolean(event.isAllDay),
      isOnlineMeeting: Boolean(event.isOnlineMeeting),
      isOrganizer: Boolean(isOrganizer),
      isReminderOn: Boolean(event.isReminderOn),
      lastModifiedDateTime: event.lastModifiedDateTime ?? null,
      location: trimOrNull(event.location?.displayName),
      locations: (event.locations ?? []).map((location) => ({
        displayName: trimOrNull(location.displayName),
      })),
      occurrenceId: event.originalStart ?? null,
      onlineMeeting: parseOnlineMeetingInfo(event),
      onlineMeetingProvider: trimOrNull(event.onlineMeetingProvider),
      organizer,
      recurrence: parseRecurrence(event.recurrence),
      reminderMinutesBeforeStart:
        typeof event.reminderMinutesBeforeStart === "number"
          ? event.reminderMinutesBeforeStart
          : null,
      responseRequested: event.responseRequested ?? null,
      responseStatus: parseResponseStatus(event.responseStatus),
      sensitivity: parseSensitivity(event.sensitivity),
      seriesMasterId: event.seriesMasterId ?? null,
      showAs: parseShowAs(event.showAs),
      start: normalizeGraphDateTime(event.start?.dateTime),
      subject: trimOrFallback(event.subject, "(no title)"),
      timeZone: event.start?.timeZone ?? this.config.timeZone,
      type: event.type ?? null,
      unsupportedReason: getUnsupportedReason(event),
      webLink: event.webLink ?? null,
    };
  }

  private toGraphEventPayload(
    draft: EventDraft,
    mode: "create" | "update",
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      allowNewTimeProposals: draft.allowNewTimeProposals,
      attendees: draft.attendees.map((attendee) => ({
        emailAddress: {
          address: attendee.email,
          name: attendee.name,
        },
        type:
          attendee.type === "resource"
            ? "resource"
            : attendee.type === "optional"
              ? "optional"
              : "required",
      })),
      categories: draft.categories,
      end: {
        dateTime: formatGraphDateTime(draft.end, draft.timeZone),
        timeZone: draft.timeZone,
      },
      isAllDay: draft.isAllDay,
      isOnlineMeeting: draft.isOnlineMeeting,
      isReminderOn: draft.isReminderOn,
      responseRequested: draft.responseRequested,
      sensitivity: draft.sensitivity,
      showAs: draft.showAs,
      start: {
        dateTime: formatGraphDateTime(draft.start, draft.timeZone),
        timeZone: draft.timeZone,
      },
      subject: draft.subject,
    };

    if (draft.body?.trim()) {
      payload.body = {
        content: draft.body,
        contentType: draft.bodyContentType === "text" ? "Text" : "HTML",
      };
    } else if (mode === "update") {
      payload.body = {
        content: "",
        contentType: "Text",
      };
    }

    if (draft.location?.trim()) {
      payload.location = {
        displayName: draft.location.trim(),
      };
    } else if (mode === "update") {
      payload.location = null;
    }

    payload.reminderMinutesBeforeStart = draft.isReminderOn
      ? (draft.reminderMinutesBeforeStart ?? 15)
      : null;

    if (draft.recurrence) {
      payload.recurrence = {
        pattern: {
          dayOfMonth: draft.recurrence.pattern.dayOfMonth ?? undefined,
          daysOfWeek: draft.recurrence.pattern.daysOfWeek,
          firstDayOfWeek: draft.recurrence.pattern.firstDayOfWeek ?? undefined,
          index: draft.recurrence.pattern.index ?? undefined,
          interval: draft.recurrence.pattern.interval,
          month: draft.recurrence.pattern.month ?? undefined,
          type: draft.recurrence.pattern.type,
        },
        range: {
          endDate: draft.recurrence.range.endDate ?? undefined,
          numberOfOccurrences: draft.recurrence.range.numberOfOccurrences ?? undefined,
          recurrenceTimeZone: draft.recurrence.range.recurrenceTimeZone ?? draft.timeZone,
          startDate: draft.recurrence.range.startDate,
          type: draft.recurrence.range.type,
        },
      };
    } else if (mode === "update") {
      payload.recurrence = null;
    }

    if (draft.isOnlineMeeting) {
      payload.onlineMeetingProvider = "teamsForBusiness";
    } else if (mode === "update") {
      payload.onlineMeetingProvider = "unknown";
    }

    return payload;
  }
}

function formatGraphDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function getUnsupportedReason(event: GraphEvent): null | string {
  if (!event.start?.dateTime || !event.end?.dateTime) {
    return "This event has incomplete schedule data and cannot be edited here.";
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeGraphDateTime(value?: string): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date(`${value}Z`).toISOString();
}

function parseGraphAttachment(value: unknown): EventAttachment {
  if (!isRecord(value)) {
    throw new Error("Unexpected attachment payload.");
  }

  return {
    contentType: readOptionalString(value, "contentType") ?? null,
    id: readRequiredString(value, "id"),
    isInline: Boolean(readOptionalBoolean(value, "isInline")),
    name: trimOrFallback(readOptionalString(value, "name"), "Attachment"),
    size: readOptionalNumber(value, "size") ?? 0,
  };
}

function parseGraphAttendees(value?: unknown[]): GraphAttendee[] | undefined {
  if (!value) {
    return undefined;
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("Unexpected attendee payload.");
    }

    const recipient = parseGraphRecipient(entry);
    const status = readOptionalRecord(entry, "status");
    let attendeeStatus: GraphAttendee["status"] = undefined;

    if (status) {
      attendeeStatus = {
        response: readOptionalString(status, "response"),
        time: readOptionalString(status, "time"),
      };
    }

    return {
      emailAddress: recipient?.emailAddress,
      status: attendeeStatus,
      type: readOptionalString(entry, "type"),
    };
  });
}

function parseGraphBody(value?: Record<string, unknown>): GraphBody | undefined {
  if (!value) {
    return undefined;
  }

  return {
    content: readOptionalString(value, "content"),
    contentType: readOptionalString(value, "contentType"),
  };
}

function parseGraphCalendar(value: unknown): GraphCalendar {
  if (!isRecord(value)) {
    throw new Error("Unexpected Microsoft Graph calendar payload.");
  }

  const owner = readOptionalRecord(value, "owner");
  let parsedOwner: GraphCalendar["owner"] = undefined;
  if (owner) {
    parsedOwner = {
      address: readOptionalString(owner, "address"),
      name: readOptionalString(owner, "name"),
    };
  }

  return {
    canEdit: readOptionalBoolean(value, "canEdit"),
    canShare: readOptionalBoolean(value, "canShare"),
    color: readOptionalNullableString(value, "color"),
    hexColor: readOptionalNullableString(value, "hexColor"),
    id: readRequiredString(value, "id"),
    isDefaultCalendar: readOptionalBoolean(value, "isDefaultCalendar"),
    name: readOptionalString(value, "name"),
    owner: parsedOwner,
  };
}

function parseGraphOutlookCategory(value: unknown): OutlookCategory {
  if (!isRecord(value)) {
    throw new Error("Unexpected Microsoft Graph category payload.");
  }

  const displayName = trimOrNull(readOptionalString(value, "displayName"));
  if (!displayName) {
    throw new Error('Expected "displayName" to be a non-empty string.');
  }

  return {
    color: readOptionalString(value, "color") ?? "none",
    displayName,
  };
}

function parseGraphCollection(value: unknown): ParsedGraphCollection {
  if (!isRecord(value) || !Array.isArray(value.value)) {
    throw new Error("Unexpected Microsoft Graph collection payload.");
  }

  return {
    nextLink: typeof value["@odata.nextLink"] === "string" ? value["@odata.nextLink"] : undefined,
    value: value.value,
  };
}

function parseGraphDateTime(value?: Record<string, unknown>): GraphDateTimeTimeZone | undefined {
  if (!value) {
    return undefined;
  }

  const dateTime = readOptionalString(value, "dateTime");
  if (!dateTime) {
    return undefined;
  }

  return {
    dateTime,
    timeZone: readOptionalString(value, "timeZone"),
  };
}

function parseGraphEvent(value: unknown): GraphEvent {
  if (!isRecord(value)) {
    throw new Error("Unexpected Microsoft Graph event payload.");
  }

  return {
    "@odata.etag": readOptionalString(value, "@odata.etag"),
    allowNewTimeProposals: readOptionalBoolean(value, "allowNewTimeProposals"),
    attendees: parseGraphAttendees(readOptionalArray(value, "attendees")),
    body: parseGraphBody(readOptionalRecord(value, "body")),
    bodyPreview: readOptionalString(value, "bodyPreview"),
    categories: readOptionalStringArray(value, "categories"),
    changeKey: readOptionalString(value, "changeKey"),
    end: parseGraphDateTime(readOptionalRecord(value, "end")),
    hasAttachments: readOptionalBoolean(value, "hasAttachments"),
    id: readRequiredString(value, "id"),
    isAllDay: readOptionalBoolean(value, "isAllDay"),
    isCancelled: readOptionalBoolean(value, "isCancelled"),
    isOnlineMeeting: readOptionalBoolean(value, "isOnlineMeeting"),
    isOrganizer: readOptionalBoolean(value, "isOrganizer"),
    isReminderOn: readOptionalBoolean(value, "isReminderOn"),
    lastModifiedDateTime: readOptionalString(value, "lastModifiedDateTime"),
    location: parseGraphLocation(readOptionalRecord(value, "location")),
    locations: parseGraphLocations(readOptionalArray(value, "locations")),
    onlineMeeting: parseGraphOnlineMeeting(readOptionalRecord(value, "onlineMeeting")),
    onlineMeetingProvider: readOptionalString(value, "onlineMeetingProvider"),
    organizer: parseGraphRecipient(readOptionalRecord(value, "organizer")),
    originalStart: readOptionalString(value, "originalStart"),
    recurrence: parseGraphRecurrence(readOptionalRecord(value, "recurrence")),
    reminderMinutesBeforeStart: readOptionalNumber(value, "reminderMinutesBeforeStart"),
    responseRequested: readOptionalBoolean(value, "responseRequested"),
    responseStatus: parseGraphResponseStatus(readOptionalRecord(value, "responseStatus")),
    sensitivity: readOptionalString(value, "sensitivity"),
    seriesMasterId: readOptionalString(value, "seriesMasterId"),
    showAs: readOptionalString(value, "showAs"),
    start: parseGraphDateTime(readOptionalRecord(value, "start")),
    subject: readOptionalString(value, "subject"),
    type: readOptionalString(value, "type"),
    webLink: readOptionalString(value, "webLink"),
  };
}

function parseGraphLocation(value?: Record<string, unknown>): GraphLocation | undefined {
  if (!value) {
    return undefined;
  }

  return {
    displayName: readOptionalString(value, "displayName"),
  };
}

function parseGraphLocations(values?: unknown[]): GraphLocation[] | undefined {
  if (!values) {
    return undefined;
  }

  return values
    .map((entry) => (isRecord(entry) ? parseGraphLocation(entry) : undefined))
    .filter((entry): entry is GraphLocation => Boolean(entry));
}

function parseGraphOnlineMeeting(value?: Record<string, unknown>): GraphOnlineMeeting | undefined {
  if (!value) {
    return undefined;
  }

  const phonesValue = readOptionalArray(value, "phones");
  let phones: { number?: string }[] | undefined = undefined;
  if (phonesValue) {
    phones = phonesValue.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      return [{ number: readOptionalString(entry, "number") }];
    });
  }

  return {
    conferenceId: readOptionalString(value, "conferenceId"),
    joinUrl: readOptionalString(value, "joinUrl"),
    phones,
  };
}

function parseGraphRecipient(value?: Record<string, unknown>): GraphRecipient | undefined {
  if (!value) {
    return undefined;
  }

  const emailAddress = readOptionalRecord(value, "emailAddress");
  let parsedAddress: GraphRecipient["emailAddress"] = undefined;
  if (emailAddress) {
    parsedAddress = {
      address: readOptionalString(emailAddress, "address"),
      name: readOptionalString(emailAddress, "name"),
    };
  }

  return {
    emailAddress: parsedAddress,
  };
}

function parseGraphRecurrence(value?: Record<string, unknown>): GraphRecurrence | undefined {
  if (!value) {
    return undefined;
  }

  const pattern = readOptionalRecord(value, "pattern");
  const range = readOptionalRecord(value, "range");

  return {
    pattern: pattern
      ? {
          dayOfMonth: readOptionalNumber(pattern, "dayOfMonth"),
          daysOfWeek: readOptionalStringArray(pattern, "daysOfWeek"),
          firstDayOfWeek: readOptionalString(pattern, "firstDayOfWeek"),
          index: readOptionalString(pattern, "index"),
          interval: readOptionalNumber(pattern, "interval"),
          month: readOptionalNumber(pattern, "month"),
          type: readOptionalString(pattern, "type"),
        }
      : undefined,
    range: range
      ? {
          endDate: readOptionalString(range, "endDate"),
          numberOfOccurrences: readOptionalNumber(range, "numberOfOccurrences"),
          recurrenceTimeZone: readOptionalString(range, "recurrenceTimeZone"),
          startDate: readOptionalString(range, "startDate"),
          type: readOptionalString(range, "type"),
        }
      : undefined,
  };
}

function parseGraphResponseStatus(
  value?: Record<string, unknown>,
): GraphResponseStatus | undefined {
  if (!value) {
    return undefined;
  }

  return {
    response: readOptionalString(value, "response"),
    time: readOptionalString(value, "time"),
  };
}

function extractGoogleMeetUrl(text?: string): string | null {
  if (!text) {
    return null;
  }
  const match = text.match(/https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:\?[^\s]*)?/i);
  return match ? match[0] : null;
}

function parseOnlineMeetingInfo(event: GraphEvent): null | OnlineMeetingInfo {
  if (!event.onlineMeeting && !event.onlineMeetingProvider) {
    return null;
  }

  let joinUrl = event.onlineMeeting?.joinUrl ?? null;

  if (!joinUrl) {
    joinUrl =
      extractGoogleMeetUrl(event.body?.content) ??
      extractGoogleMeetUrl(event.location?.displayName) ??
      null;
  }

  return {
    conferenceId: event.onlineMeeting?.conferenceId ?? null,
    joinUrl,
    phones: (event.onlineMeeting?.phones ?? []).map((phone) => phone.number).filter(isString),
    provider: trimOrNull(event.onlineMeetingProvider),
  };
}

function parseRecurrence(value?: GraphRecurrence): null | Recurrence {
  if (!value?.pattern || !value.range) {
    return null;
  }

  const interval = typeof value.pattern.interval === "number" ? value.pattern.interval : 1;
  const startDate = value.range.startDate ?? new Date().toISOString().slice(0, 10);

  return {
    pattern: {
      dayOfMonth: value.pattern.dayOfMonth ?? null,
      daysOfWeek: (value.pattern.daysOfWeek ?? []).filter(
        isString,
      ) as Recurrence["pattern"]["daysOfWeek"],
      firstDayOfWeek: normalizeDayOfWeek(value.pattern.firstDayOfWeek),
      index: value.pattern.index ?? null,
      interval,
      month: value.pattern.month ?? null,
      type: normalizePatternType(value.pattern.type),
    },
    range: {
      endDate: value.range.endDate ?? null,
      numberOfOccurrences: value.range.numberOfOccurrences ?? null,
      recurrenceTimeZone: value.range.recurrenceTimeZone ?? null,
      startDate,
      type: normalizeRangeType(value.range.type),
    },
  };
}

function normalizeGraphResponseValue(value: null | string | undefined): null | string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "accepted" || normalized === "declined" || normalized === "tentative") {
    return normalized;
  }

  if (normalized === "tentativelyaccepted") {
    return "tentative";
  }

  if (normalized === "none" || normalized === "notresponded" || normalized === "organizer") {
    return "none";
  }

  return normalized;
}

function parseResponseStatus(value?: GraphResponseStatus): null | ParticipantResponseStatus {
  if (!value) {
    return null;
  }

  return {
    response: normalizeGraphResponseValue(value.response),
    time: value.time ?? null,
  };
}

function parseSensitivity(value?: string): CalendarEvent["sensitivity"] {
  if (
    value === "personal" ||
    value === "private" ||
    value === "confidential" ||
    value === "normal"
  ) {
    return value;
  }

  return null;
}

function parseShowAs(value?: string): CalendarEvent["showAs"] {
  if (
    value === "free" ||
    value === "tentative" ||
    value === "busy" ||
    value === "oof" ||
    value === "workingElsewhere" ||
    value === "unknown"
  ) {
    return value;
  }

  return null;
}

function readGraphErrorMessage(value: unknown): null | string {
  if (!isRecord(value)) {
    return null;
  }

  const error = readOptionalRecord(value, "error");
  if (!error) {
    return null;
  }

  return readOptionalString(error, "message") ?? null;
}

function readOptionalArray(value: Record<string, unknown>, key: string): unknown[] | undefined {
  const result = value[key];
  if (Array.isArray(result)) {
    return result;
  }

  return undefined;
}

function readOptionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const result = value[key];
  if (typeof result === "boolean") {
    return result;
  }

  return undefined;
}

function readOptionalNullableString(
  value: Record<string, unknown>,
  key: string,
): null | string | undefined {
  const result = value[key];
  if (result === null) {
    return null;
  }

  if (typeof result === "string") {
    return result;
  }

  return undefined;
}

function readOptionalNumber(value: Record<string, unknown>, key: string): number | undefined {
  const result = value[key];
  if (typeof result === "number") {
    return result;
  }

  return undefined;
}

function readOptionalRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const result = value[key];
  if (isRecord(result)) {
    return result;
  }

  return undefined;
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const result = value[key];
  if (typeof result === "string") {
    return result;
  }

  return undefined;
}

function readOptionalStringArray(
  value: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const result = value[key];
  if (!Array.isArray(result)) {
    return undefined;
  }

  return result.filter(isString);
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const result = readOptionalString(value, key);
  if (result) {
    return result;
  }

  throw new Error(`Expected "${key}" to be a string.`);
}

function stripHtml(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractPlainTextFromGraphHtml(value?: string): null | string {
  return trimOrNull(stripHtml(value));
}

function toParticipant(value: GraphAttendee | GraphRecipient): EventParticipant {
  let status: ParticipantResponseStatus | null = null;
  let response: null | string = null;
  let type: EventParticipant["type"] = "required";
  if ("status" in value) {
    const normalizedResponse = normalizeGraphResponseValue(value.status?.response);
    response = normalizedResponse;
    status = {
      response: normalizedResponse,
      time: value.status?.time ?? null,
    };
    if (value.type === "optional" || value.type === "resource") {
      ({ type } = value);
    }
  }

  return {
    email: value.emailAddress?.address ?? null,
    name: value.emailAddress?.name ?? null,
    response,
    status,
    type,
  };
}

function trimOrFallback(value: null | string | undefined, fallback: string): string {
  const trimmedValue = value?.trim();
  if (trimmedValue) {
    return trimmedValue;
  }

  return fallback;
}

function trimOrNull(value: null | string | undefined): null | string {
  const trimmedValue = value?.trim();
  if (trimmedValue) {
    return trimmedValue;
  }

  return null;
}

function normalizePatternType(value?: string): Recurrence["pattern"]["type"] {
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "absoluteMonthly" ||
    value === "absoluteYearly"
  ) {
    return value;
  }

  return "daily";
}

function normalizeRangeType(value?: string): Recurrence["range"]["type"] {
  if (value === "endDate" || value === "numbered" || value === "noEnd") {
    return value;
  }

  return "noEnd";
}

function normalizeDayOfWeek(value?: string): Recurrence["pattern"]["firstDayOfWeek"] {
  if (
    value === "sunday" ||
    value === "monday" ||
    value === "tuesday" ||
    value === "wednesday" ||
    value === "thursday" ||
    value === "friday" ||
    value === "saturday"
  ) {
    return value;
  }

  return null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export { extractPlainTextFromGraphHtml, normalizeGraphResponseValue };
export default GraphCalendarService;
