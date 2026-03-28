import type { EventAttachment, EventResponseAction } from "./schemas";

interface ReminderPopupData {
  dedupeKey: string;
  subject: string;
  location: null | string;
  start: string;
  end: string;
}

export { type EventAttachment, type EventResponseAction, type ReminderPopupData };
