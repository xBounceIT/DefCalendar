import type { CalendarEvent } from "./schemas";

function normalizeEventResponseValue(value: null | string | undefined): null | string {
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

function isDeclinedEventResponse(value: null | string | undefined): boolean {
  return normalizeEventResponseValue(value) === "declined";
}

function isPendingEventResponse(value: null | string | undefined): boolean {
  const normalized = normalizeEventResponseValue(value);
  return normalized === null || normalized === "none";
}

function isPendingInvite(
  event: Pick<CalendarEvent, "cancelled" | "isOrganizer" | "responseStatus">,
): boolean {
  return (
    !event.cancelled && !event.isOrganizer && isPendingEventResponse(event.responseStatus?.response)
  );
}

function isFuturePendingInvite(
  event: Pick<CalendarEvent, "cancelled" | "isOrganizer" | "responseStatus" | "start">,
  now = Date.now(),
): boolean {
  return Date.parse(event.start) > now && isPendingInvite(event);
}

export {
  isDeclinedEventResponse,
  isFuturePendingInvite,
  isPendingEventResponse,
  isPendingInvite,
  normalizeEventResponseValue,
};
