import { normalizeGraphResponseValue } from "@main/graph/calendar-service";
import type { CalendarEvent, NewEventNotificationItem } from "@shared/schemas";

type Listener = (items: NewEventNotificationItem[]) => void;

class NewEventNotificationService {
  private items: NewEventNotificationItem[] = [];
  private readonly listeners = new Set<Listener>();

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
    const existingIds = new Set(this.items.map((item) => item.eventId));
    const candidates: NewEventNotificationItem[] = [];

    for (const event of events) {
      if (existingIds.has(event.id)) {
        continue;
      }
      if (!shouldNotifyOnNewEvent(event)) {
        continue;
      }

      candidates.push(toNotificationItem(event));
      existingIds.add(event.id);
    }

    if (candidates.length === 0) {
      return;
    }

    this.items = [...this.items, ...candidates];
    this.broadcast();
  }

  dismiss(eventId: string): void {
    const nextItems = this.items.filter((item) => item.eventId !== eventId);
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

function shouldNotifyOnNewEvent(event: CalendarEvent): boolean {
  if (event.cancelled) {
    return false;
  }
  if (event.isOrganizer) {
    return false;
  }

  const normalized = normalizeGraphResponseValue(event.responseStatus?.response);
  return normalized === null || normalized === "none";
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
