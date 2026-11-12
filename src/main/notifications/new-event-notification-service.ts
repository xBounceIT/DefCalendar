import { randomUUID } from "node:crypto";
import type {
  CalendarEvent,
  EventReferenceArgs,
  InviteNotificationReference,
  NewEventNotificationItem,
} from "@shared/schemas";
import { newEventNotificationItemSchema } from "@shared/schemas";
import {
  isDeclinedEventResponse,
  isFuturePendingInvite,
  isPendingInvite,
  normalizeEventResponseValue,
} from "@shared/event-response";
import buildEventReferenceKey from "@shared/event-reference";

type Listener = (items: NewEventNotificationItem[]) => void;

interface NotificationStore {
  listPendingInvites(): NewEventNotificationItem[];
  savePendingInvites(items: NewEventNotificationItem[]): void;
  runInTransaction?(operation: () => void): void;
}

class NewEventNotificationService {
  private items: NewEventNotificationItem[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly now: () => number;

  constructor(
    now: () => number = Date.now,
    private readonly store?: NotificationStore,
  ) {
    this.now = now;
    this.items = this.readItems();
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
    const now = this.now();
    this.update(() => {
      for (const event of events) {
        if (!isFuturePendingInvite(event, now)) {
          continue;
        }
        const existing = this.find(event);
        if (existing && !existing.popupDismissed) {
          continue;
        }
        this.put({
          ...toNotificationItem(event),
          kind: existing?.kind ?? "invitation",
          revision: existing?.revision,
          popupDismissed: false,
        });
      }
    });
  }

  reconcile(
    events: CalendarEvent[],
    previousEvents: CalendarEvent[],
    notify: boolean,
    persist?: () => void,
  ): void {
    this.update(() => {
      const eventsById = new Map(events.map((event) => [event.id, event]));
      const previousById = new Map(previousEvents.map((event) => [event.id, event]));

      for (const previous of previousEvents) {
        if (
          !eventsById.has(previous.id) &&
          !previous.isOrganizer &&
          !previous.cancelled &&
          !isDeclinedEventResponse(previous.responseStatus?.response) &&
          Date.parse(previous.end) > this.now()
        ) {
          this.put({ ...toNotificationItem(previous), kind: "cancelled", popupDismissed: !notify });
        }
      }

      for (const event of events) {
        const existing = this.find(event);
        const previous = previousById.get(event.id);
        if (event.isOrganizer) {
          this.remove(event);
          continue;
        }
        if (event.cancelled) {
          if (previous && !previous.cancelled && Date.parse(event.end) > this.now()) {
            this.put({ ...toNotificationItem(event), kind: "cancelled", popupDismissed: !notify });
          }
          continue;
        }
        const changed = previous && !previous.cancelled && hasMeetingChanges(previous, event);
        if (changed && Date.parse(event.end) > this.now()) {
          this.put({ ...toNotificationItem(event), kind: "updated", popupDismissed: !notify });
        } else if (
          isPendingInvite(event) &&
          (existing || isFuturePendingInvite(event, this.now()))
        ) {
          this.put({
            ...toNotificationItem(event),
            kind: existing?.kind === "cancelled" ? "invitation" : (existing?.kind ?? "invitation"),
            revision: existing?.revision,
            popupDismissed: existing ? (existing.popupDismissed ?? false) : true,
          });
        } else if (
          existing?.kind !== "updated" ||
          normalizeEventResponseValue(previous?.responseStatus?.response) !==
            normalizeEventResponseValue(event.responseStatus?.response)
        ) {
          this.remove(event);
        }
      }
    }, persist);
  }

  hide(reference: EventReferenceArgs): void {
    this.hideItems(new Set([buildEventReferenceKey(reference)]));
  }

  hideAll(): void {
    this.hideItems(new Set(this.items.map(buildEventReferenceKey)));
  }

  acknowledge(reference: InviteNotificationReference): void {
    const item = this.items.find(
      (candidate) => buildEventReferenceKey(candidate) === buildEventReferenceKey(reference),
    );
    if (!item || item.revision !== reference.revision) {
      return;
    }
    if (item?.kind === "updated" && item.requiresResponse) {
      this.update(() => {
        this.put({ ...item, kind: "invitation", popupDismissed: true });
      });
    } else if (item?.kind === "updated" || item?.kind === "cancelled") {
      this.dismiss(reference);
    }
  }

  dismissIfCurrent(reference: InviteNotificationReference, persist?: () => void): boolean {
    const item = this.items.find(
      (candidate) => buildEventReferenceKey(candidate) === buildEventReferenceKey(reference),
    );
    if (item?.revision !== reference.revision) {
      return false;
    }
    this.dismiss(reference, persist);
    return true;
  }

  reload(): void {
    if (this.store) {
      const items = this.readItems();
      if (JSON.stringify(items) !== JSON.stringify(this.items)) {
        this.items = items;
        this.broadcast();
      }
    }
  }

  private readItems(): NewEventNotificationItem[] {
    const items = this.store?.listPendingInvites() ?? [];
    if (items.every((item) => item.revision !== undefined)) {
      return items;
    }
    const versioned = items.map((item) =>
      newEventNotificationItemSchema.parse({ ...item, revision: item.revision ?? randomUUID() }),
    );
    this.store?.savePendingInvites(versioned);
    return versioned;
  }

  private hideItems(keys: Set<string>): void {
    this.update(() => {
      this.items = this.items.map((item) => {
        if (item.popupDismissed || !keys.has(buildEventReferenceKey(item))) {
          return item;
        }
        return { ...item, popupDismissed: true };
      });
    });
  }

  private find(event: CalendarEvent): NewEventNotificationItem | undefined {
    return this.items.find(
      (item) => item.calendarId === event.calendarId && item.eventId === event.id,
    );
  }

  private put(item: NewEventNotificationItem): void {
    item = newEventNotificationItemSchema.parse({
      ...item,
      revision: item.revision ?? randomUUID(),
    });
    const key = buildEventReferenceKey(item);
    const index = this.items.findIndex((current) => buildEventReferenceKey(current) === key);
    if (index === -1) {
      this.items.push(item);
    } else {
      this.items[index] = item;
    }
  }

  private remove(event: CalendarEvent): void {
    this.items = this.items.filter(
      (item) => item.calendarId !== event.calendarId || item.eventId !== event.id,
    );
  }

  dismiss(reference: EventReferenceArgs, persist?: () => void): void {
    const eventKey = buildEventReferenceKey(reference);
    this.update(() => {
      this.items = this.items.filter((item) => buildEventReferenceKey(item) !== eventKey);
    }, persist);
  }

  clear(): void {
    if (this.items.length === 0) {
      return;
    }

    this.update(() => {
      this.items = [];
    });
  }

  private update(operation: () => void, persist?: () => void): void {
    const previous = this.items;
    let next = previous;
    try {
      this.items = [...previous];
      operation();
      next = this.items;
    } finally {
      this.items = previous;
    }
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    const save = () => {
      persist?.();
      if (changed) {
        this.store?.savePendingInvites(next);
      }
    };
    if (persist && this.store?.runInTransaction) {
      this.store.runInTransaction(save);
    } else {
      save();
    }
    if (changed) {
      this.items = next;
      this.broadcast();
    }
  }

  private broadcast(): void {
    this.items = [...this.items];
    for (const listener of this.listeners) {
      listener(this.items);
    }
  }
}

function hasMeetingChanges(previous: CalendarEvent, event: CalendarEvent): boolean {
  return (
    previous.subject !== event.subject ||
    previous.start !== event.start ||
    previous.end !== event.end ||
    previous.isAllDay !== event.isAllDay ||
    previous.location !== event.location ||
    previous.body !== event.body ||
    previous.onlineMeeting?.joinUrl !== event.onlineMeeting?.joinUrl ||
    participantIdentity(previous.organizer) !== participantIdentity(event.organizer) ||
    attendeeMembership(previous) !== attendeeMembership(event)
  );
}

function participantIdentity(participant: CalendarEvent["organizer"]): string {
  return participant?.email?.trim().toLowerCase() || participant?.name?.trim() || "";
}

function attendeeMembership(event: CalendarEvent): string {
  return JSON.stringify(
    event.attendees.map((attendee) => [participantIdentity(attendee), attendee.type]).toSorted(),
  );
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
    requiresResponse: isPendingInvite(event),
    start: event.start,
    subject: event.subject,
  };
}

export default NewEventNotificationService;
