import type { CalendarEvent, CalendarSummary, EventDraft, EventParticipant } from '@shared/schemas';
import type { AppConfig } from '@main/config';
import type MsalAuthService from '@main/auth/msal-auth-service';
import delay from 'delay';

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
  };
}

interface GraphEvent {
  '@odata.etag'?: string;
  attendees?: GraphAttendee[];
  body?: {
    content?: string;
  };
  bodyPreview?: string;
  changeKey?: string;
  end?: GraphDateTimeTimeZone;
  id: string;
  isAllDay?: boolean;
  isReminderOn?: boolean;
  lastModifiedDateTime?: string;
  location?: {
    displayName?: string;
  };
  onlineMeetingProvider?: string;
  organizer?: GraphRecipient;
  recurrence?: unknown;
  reminderMinutesBeforeStart?: number;
  start?: GraphDateTimeTimeZone;
  subject?: string;
  type?: string;
  webLink?: string;
}

interface SendRequestArgs {
  forceRefresh?: boolean;
  init?: RequestInit;
  pathOrUrl: string;
  retryCount?: number;
}

class GraphCalendarService {
  private readonly auth: MsalAuthService;
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0';
  private readonly config: AppConfig;

  constructor(auth: MsalAuthService, config: AppConfig) {
    this.auth = auth;
    this.config = config;
  }

  async listCalendars(): Promise<CalendarSummary[]> {
    const response = await this.paginate(
      '/me/calendars?$select=id,name,color,hexColor,canEdit,canShare,isDefaultCalendar,owner',
      parseGraphCalendar,
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
        id: calendar.id,
        isDefaultCalendar: Boolean(calendar.isDefaultCalendar),
        isVisible: true,
        name: calendar.name ?? 'Untitled calendar',
        ownerAddress: calendar.owner?.address ?? null,
        ownerName: calendar.owner?.name ?? null,
      };
    });
  }

  async listCalendarView(calendarId: string, rangeStart: string, rangeEnd: string): Promise<CalendarEvent[]> {
    const query = new URLSearchParams({
      '$select':
        'id,subject,body,bodyPreview,location,start,end,isAllDay,isReminderOn,reminderMinutesBeforeStart,webLink,changeKey,type,attendees,organizer,recurrence,onlineMeetingProvider,lastModifiedDateTime',
      '$top': '250',
      endDateTime: rangeEnd,
      startDateTime: rangeStart,
    });

    const response = await this.paginate(
      `/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${query.toString()}`,
      parseGraphEvent,
    );

    return response.map((event) => this.toCalendarEvent(event, calendarId));
  }

  async createEvent(draft: EventDraft): Promise<CalendarEvent> {
    const response = parseGraphEvent(
      await this.requestJson(`/me/calendars/${encodeURIComponent(draft.calendarId)}/events`, {
        body: JSON.stringify(this.toGraphEventPayload(draft)),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );

    return this.toCalendarEvent(response, draft.calendarId);
  }

  async updateEvent(draft: EventDraft): Promise<CalendarEvent> {
    if (!draft.id) {
      throw new Error('Event id is required for updates.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (draft.etag) {
      headers['If-Match'] = draft.etag;
    }

    const response = parseGraphEvent(
      await this.requestJson(
        `/me/calendars/${encodeURIComponent(draft.calendarId)}/events/${encodeURIComponent(draft.id)}`,
        {
          body: JSON.stringify(this.toGraphEventPayload(draft)),
          headers,
          method: 'PATCH',
        },
      ),
    );

    return this.toCalendarEvent(response, draft.calendarId);
  }

  async deleteEvent(calendarId: string, eventId: string, etag?: null | string): Promise<void> {
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-Match'] = etag;
    }

    await this.requestNoContent(`/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      headers,
      method: 'DELETE',
    });
  }

  private async paginate<TItem>(pathOrUrl: string, parseItem: (value: unknown) => TItem): Promise<TItem[]> {
    const items: TItem[] = [];
    let nextUrl: string | undefined = pathOrUrl;

    while (nextUrl) {
      // oxlint-disable-next-line no-await-in-loop -- Graph pagination is cursor-based.
      const response = parseGraphCollection(await this.requestJson(nextUrl));
      items.push(...response.value.map(parseItem));
      nextUrl = response.nextLink;
    }

    return items;
  }

  private async requestJson(pathOrUrl: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.sendRequest({ init, pathOrUrl });
    if (!response.ok) {
      throw new Error(await this.getErrorMessage(response));
    }

    return response.json();
  }

  private async requestNoContent(pathOrUrl: string, init: RequestInit = {}): Promise<void> {
    const response = await this.sendRequest({ init, pathOrUrl });
    if (!response.ok) {
      throw new Error(await this.getErrorMessage(response));
    }

    if (response.status !== 204) {
      await response.arrayBuffer();
    }
  }

  private async sendRequest(args: SendRequestArgs): Promise<Response> {
    const {
      forceRefresh = false,
      init = {},
      pathOrUrl,
      retryCount = 0,
    } = args;
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${await this.auth.getAccessToken(forceRefresh)}`);
    headers.set('Prefer', `outlook.timezone="${this.config.timeZone}"`);

    let requestUrl = `${this.baseUrl}${pathOrUrl}`;
    if (pathOrUrl.startsWith('http')) {
      requestUrl = pathOrUrl;
    }

    const response = await fetch(requestUrl, {
      ...init,
      headers,
    });

    if (response.status === 401 && !forceRefresh) {
      return this.sendRequest({
        forceRefresh: true,
        init,
        pathOrUrl,
        retryCount,
      });
    }

    const shouldRetry = (response.status === 429 || response.status === 503) && retryCount < 3;
    if (shouldRetry) {
      await delay(this.getRetryDelay(response.headers.get('Retry-After'), retryCount));
      return this.sendRequest({
        forceRefresh,
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

  private toCalendarEvent(event: GraphEvent, calendarId: string): CalendarEvent {
    let reminderMinutesBeforeStart: null | number = null;
    if (typeof event.reminderMinutesBeforeStart === 'number') {
      ({ reminderMinutesBeforeStart } = event);
    }

    let organizer: EventParticipant | null = null;
    if (event.organizer) {
      organizer = toParticipant(event.organizer);
    }

    return {
      attendees: (event.attendees ?? []).map(toParticipant),
      body: stripHtml(event.body?.content),
      bodyPreview: trimOrNull(event.bodyPreview),
      calendarId,
      changeKey: event.changeKey ?? null,
      end: normalizeGraphDateTime(event.end?.dateTime),
      etag: event['@odata.etag'] ?? null,
      id: event.id,
      isAllDay: Boolean(event.isAllDay),
      isReminderOn: Boolean(event.isReminderOn),
      lastModifiedDateTime: event.lastModifiedDateTime ?? null,
      location: trimOrNull(event.location?.displayName),
      organizer,
      reminderMinutesBeforeStart,
      start: normalizeGraphDateTime(event.start?.dateTime),
      subject: trimOrFallback(event.subject, '(no title)'),
      timeZone: event.start?.timeZone ?? this.config.timeZone,
      type: event.type ?? null,
      unsupportedReason: getUnsupportedReason(event),
      webLink: event.webLink ?? null,
    };
  }

  private toGraphEventPayload(draft: EventDraft): Record<string, unknown> {
    let body: { content: string; contentType: string } | undefined = undefined;
    if (draft.body?.trim()) {
      body = {
        content: draft.body.trim(),
        contentType: 'Text',
      };
    }

    let location: { displayName: string } | undefined = undefined;
    if (draft.location?.trim()) {
      location = {
        displayName: draft.location.trim(),
      };
    }

    let reminderMinutesBeforeStart: null | number = null;
    if (draft.isReminderOn) {
      reminderMinutesBeforeStart = draft.reminderMinutesBeforeStart ?? 15;
    }

    return {
      body,
      end: {
        dateTime: formatGraphDateTime(draft.end, draft.timeZone),
        timeZone: draft.timeZone,
      },
      isAllDay: draft.isAllDay,
      isReminderOn: draft.isReminderOn,
      location,
      reminderMinutesBeforeStart,
      start: {
        dateTime: formatGraphDateTime(draft.start, draft.timeZone),
        timeZone: draft.timeZone,
      },
      subject: draft.subject,
    };
  }
}

function formatGraphDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function getUnsupportedReason(event: GraphEvent): null | string {
  const eventType = event.type ?? '';
  if (event.recurrence || ['seriesMaster', 'occurrence', 'exception'].includes(eventType)) {
    return 'Recurring events are view-only in this version. Use Outlook for changes to the series.';
  }

  if ((event.attendees?.length ?? 0) > 0) {
    return 'Meetings with attendees are view-only in this version. Use Outlook to manage participants.';
  }

  if (event.onlineMeetingProvider && event.onlineMeetingProvider !== 'unknown') {
    return 'Online meeting metadata is view-only in this version. Use Outlook for advanced meeting edits.';
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function parseGraphAttendees(value?: unknown[]): GraphAttendee[] | undefined {
  if (!value) {
    return undefined;
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Unexpected attendee payload.');
    }

    const recipient = parseGraphRecipient(entry);
    const status = readOptionalRecord(entry, 'status');
    let attendeeStatus: GraphAttendee['status'] = undefined;

    if (status) {
      attendeeStatus = {
        response: readOptionalString(status, 'response'),
      };
    }

    return {
      emailAddress: recipient?.emailAddress,
      status: attendeeStatus,
    };
  });
}

function parseGraphBody(value?: Record<string, unknown>): GraphEvent['body'] {
  if (!value) {
    return undefined;
  }

  return {
    content: readOptionalString(value, 'content'),
  };
}

function parseGraphCalendar(value: unknown): GraphCalendar {
  if (!isRecord(value)) {
    throw new Error('Unexpected Microsoft Graph calendar payload.');
  }

  const owner = readOptionalRecord(value, 'owner');
  let parsedOwner: GraphCalendar['owner'] = undefined;
  if (owner) {
    parsedOwner = {
      address: readOptionalString(owner, 'address'),
      name: readOptionalString(owner, 'name'),
    };
  }

  return {
    canEdit: readOptionalBoolean(value, 'canEdit'),
    canShare: readOptionalBoolean(value, 'canShare'),
    color: readOptionalNullableString(value, 'color'),
    hexColor: readOptionalNullableString(value, 'hexColor'),
    id: readRequiredString(value, 'id'),
    isDefaultCalendar: readOptionalBoolean(value, 'isDefaultCalendar'),
    name: readOptionalString(value, 'name'),
    owner: parsedOwner,
  };
}

function parseGraphCollection(value: unknown): ParsedGraphCollection {
  if (!isRecord(value) || !Array.isArray(value.value)) {
    throw new Error('Unexpected Microsoft Graph collection payload.');
  }

  let nextLink: string | undefined = undefined;
  if (typeof value['@odata.nextLink'] === 'string') {
    nextLink = value['@odata.nextLink'];
  }

  return {
    nextLink,
    value: value.value,
  };
}

function parseGraphDateTime(value?: Record<string, unknown>): GraphDateTimeTimeZone | undefined {
  if (!value) {
    return undefined;
  }

  const dateTime = readOptionalString(value, 'dateTime');
  if (!dateTime) {
    return undefined;
  }

  return {
    dateTime,
    timeZone: readOptionalString(value, 'timeZone'),
  };
}

function parseGraphEvent(value: unknown): GraphEvent {
  if (!isRecord(value)) {
    throw new Error('Unexpected Microsoft Graph event payload.');
  }

  return {
    '@odata.etag': readOptionalString(value, '@odata.etag'),
    attendees: parseGraphAttendees(readOptionalArray(value, 'attendees')),
    body: parseGraphBody(readOptionalRecord(value, 'body')),
    bodyPreview: readOptionalString(value, 'bodyPreview'),
    changeKey: readOptionalString(value, 'changeKey'),
    end: parseGraphDateTime(readOptionalRecord(value, 'end')),
    id: readRequiredString(value, 'id'),
    isAllDay: readOptionalBoolean(value, 'isAllDay'),
    isReminderOn: readOptionalBoolean(value, 'isReminderOn'),
    lastModifiedDateTime: readOptionalString(value, 'lastModifiedDateTime'),
    location: parseGraphLocation(readOptionalRecord(value, 'location')),
    onlineMeetingProvider: readOptionalString(value, 'onlineMeetingProvider'),
    organizer: parseGraphRecipient(readOptionalRecord(value, 'organizer')),
    recurrence: readUnknown(value, 'recurrence'),
    reminderMinutesBeforeStart: readOptionalNumber(value, 'reminderMinutesBeforeStart'),
    start: parseGraphDateTime(readOptionalRecord(value, 'start')),
    subject: readOptionalString(value, 'subject'),
    type: readOptionalString(value, 'type'),
    webLink: readOptionalString(value, 'webLink'),
  };
}

function parseGraphLocation(value?: Record<string, unknown>): GraphEvent['location'] {
  if (!value) {
    return undefined;
  }

  return {
    displayName: readOptionalString(value, 'displayName'),
  };
}

function parseGraphRecipient(value?: Record<string, unknown>): GraphRecipient | undefined {
  if (!value) {
    return undefined;
  }

  const emailAddress = readOptionalRecord(value, 'emailAddress');
  let parsedAddress: GraphRecipient['emailAddress'] = undefined;
  if (emailAddress) {
    parsedAddress = {
      address: readOptionalString(emailAddress, 'address'),
      name: readOptionalString(emailAddress, 'name'),
    };
  }

  return {
    emailAddress: parsedAddress,
  };
}

function readGraphErrorMessage(value: unknown): null | string {
  if (!isRecord(value)) {
    return null;
  }

  const error = readOptionalRecord(value, 'error');
  if (!error) {
    return null;
  }

  return readOptionalString(error, 'message') ?? null;
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
  if (typeof result === 'boolean') {
    return result;
  }

  return undefined;
}

function readOptionalNullableString(value: Record<string, unknown>, key: string): null | string | undefined {
  const result = value[key];
  if (result === null) {
    return null;
  }

  if (typeof result === 'string') {
    return result;
  }

  return undefined;
}

function readOptionalNumber(value: Record<string, unknown>, key: string): number | undefined {
  const result = value[key];
  if (typeof result === 'number') {
    return result;
  }

  return undefined;
}

function readOptionalRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const result = value[key];
  if (isRecord(result)) {
    return result;
  }

  return undefined;
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const result = value[key];
  if (typeof result === 'string') {
    return result;
  }

  return undefined;
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const result = readOptionalString(value, key);
  if (result) {
    return result;
  }

  throw new Error(`Expected "${key}" to be a string.`);
}

function readUnknown(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

function stripHtml(value?: string): null | string {
  if (!value) {
    return null;
  }

  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function toParticipant(value: GraphAttendee | GraphRecipient): EventParticipant {
  let response: null | string = null;
  if ('status' in value) {
    response = value.status?.response ?? null;
  }

  return {
    email: value.emailAddress?.address ?? null,
    name: value.emailAddress?.name ?? null,
    response,
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

export default GraphCalendarService;
