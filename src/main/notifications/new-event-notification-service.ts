import type { CalendarEvent, EventReferenceArgs, NewEventNotificationItem } from "@shared/schemas";
import { isFuturePendingInvite } from "@shared/event-response";
import buildEventReferenceKey from "@shared/event-reference";

type Listener = (items: NewEventNotificationItem[]) => void;

class NewEventNotificationService {
  private items: NewEventNotificationItem[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  getItems(): NewEventNotificationItem[] {
    return this.items;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  recordCandidates(events: CalendarEvent[]): void {
    const existingKeys = new Set(this.items.map(buildEventReferenceKey));
    const candidates: NewEventNotificationItem[] = [];
    const now = this.now();

    for (const event of events) {
      const eventKey = buildEventReferenceKey({
        calendarId: event.calendarId,
        eventId: event.id,
      });
      if (existingKeys.has(eventKey)) {
        continue;
      }
      if (!isFuturePendingInvite(event, now)) {
        continue;
      }

      candidates.push(toNotificationItem(event));
      existingKeys.add(eventKey);
    }

    if (candidates.length === 0) {
      return;
    }

    this.items = [...this.items, ...candidates];
    this.broadcast();
  }

  dismiss(reference: EventReferenceArgs): void {
    if (this.items.length === 0) {
      return;
    }

    const eventKey = buildEventReferenceKey(reference);
    const nextItems = this.items.filter((item) => buildEventReferenceKey(item) !== eventKey);
    if (nextItems.length === this.items.length) {
      return;
    }

    this.items = nextItems;
    this.broadcast();
  }

  clear(): void {
    if (this.items.length === 0) {
      return;
    }

    this.items = [];
    this.broadcast();
  }

  private broadcast(): void {
    for (const listener of this.listeners) {
      listener(this.items);
    }
  }
}

function toNotificationItem(event: CalendarEvent): NewEventNotificationItem {
  return {
    calendarId: event.calendarId,
    end: event.end,
    eventId: event.id,
    isAllDay: event.isAllDay,
    location: event.location,
    onlineMeetingJoinUrl: event.onlineMeeting?.joinUrl ?? null,
    organizerEmail: event.organizer?.email ?? null,
    organizerName: event.organizer?.name ?? null,
    start: event.start,
    subject: event.subject,
  };
}

export default NewEventNotificationService;
