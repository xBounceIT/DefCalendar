import type { CalendarEvent } from "@shared/schemas";

interface CalendarOverlapTarget {
  calendarId: string;
  end: string;
  eventId: string;
  isAllDay: boolean;
  start: string;
}

interface EventTimeRange {
  end: number;
  start: number;
}

const BUSY_AVAILABILITY = new Set(["busy", "oof", "workingElsewhere", "unknown"]);

function toCalendarOverlapTarget(event: CalendarEvent): CalendarOverlapTarget {
  return {
    calendarId: event.calendarId,
    end: event.end,
    eventId: event.id,
    isAllDay: event.isAllDay,
    start: event.start,
  };
}

function hasValidOverlapRange(event: Pick<CalendarOverlapTarget, "end" | "start">): boolean {
  return parseEventTimeRange(event) !== null;
}

function findOverlappingBusyEvents(
  target: CalendarOverlapTarget,
  candidates: CalendarEvent[],
): CalendarEvent[] {
  const targetRange = parseEventTimeRange(target);
  if (!targetRange) {
    return [];
  }

  return candidates
    .filter((candidate) => isOverlappingBusyEvent(target, targetRange, candidate))
    .toSorted((left, right) => {
      const startComparison = left.start.localeCompare(right.start);
      if (startComparison !== 0) {
        return startComparison;
      }
      return left.subject.localeCompare(right.subject);
    });
}

function isOverlappingBusyEvent(
  target: CalendarOverlapTarget,
  targetRange: EventTimeRange,
  candidate: CalendarEvent,
): boolean {
  if (candidate.calendarId === target.calendarId && candidate.id === target.eventId) {
    return false;
  }

  if (candidate.cancelled) {
    return false;
  }

  if (!BUSY_AVAILABILITY.has(candidate.showAs ?? "")) {
    return false;
  }

  if (normalizeResponseValue(candidate.responseStatus?.response) === "declined") {
    return false;
  }

  const candidateRange = parseEventTimeRange(candidate);
  if (!candidateRange) {
    return false;
  }

  return targetRange.start < candidateRange.end && targetRange.end > candidateRange.start;
}

function parseEventTimeRange(
  event: Pick<CalendarOverlapTarget, "end" | "start">,
): EventTimeRange | null {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
    return null;
  }

  return { end, start };
}

function normalizeResponseValue(response: null | string | undefined): null | string {
  const normalized = response?.trim().toLowerCase();
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

export {
  findOverlappingBusyEvents,
  hasValidOverlapRange,
  toCalendarOverlapTarget,
  type CalendarOverlapTarget,
};
