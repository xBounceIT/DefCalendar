import type { EventReferenceArgs } from "./schemas";

function buildEventReferenceKey(reference: EventReferenceArgs): string {
  return JSON.stringify([reference.calendarId, reference.eventId]);
}

export default buildEventReferenceKey;
