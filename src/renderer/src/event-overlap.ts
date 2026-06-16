import type { CalendarEvent } from "@shared/schemas";

interface CalendarOverlapTarget {
  calendarId: string;
  end: string;
  eventId: string;
  isAllDay: boolean;
  lookupEnd?: string;
  lookupStart?: string;
  seriesMasterId?: null | string;
  start: string;
}

interface EventTimeRange {
  end: number;
  start: number;
}

type RecurrencePatternType = NonNullable<CalendarEvent["recurrence"]>["pattern"]["type"];

const DAY_MS = 86_400_000;
const BUSY_AVAILABILITY = new Set(["busy", "oof", "workingElsewhere", "unknown"]);
const SERIES_LOOKUP_DAYS = 365;

function toCalendarOverlapTarget(event: CalendarEvent): CalendarOverlapTarget {
  const seriesMasterId = event.seriesMasterId ?? null;

  return {
    calendarId: event.calendarId,
    end: event.end,
    eventId: event.id,
    isAllDay: event.isAllDay,
    lookupEnd: seriesMasterId ? getSeriesLookupEnd(event) : event.end,
    lookupStart: event.start,
    seriesMasterId,
    start: event.start,
  };
}

function hasValidOverlapRange(event: Pick<CalendarOverlapTarget, "end" | "start">): boolean {
  return parseEventTimeRange(event) !== null;
}

function getCalendarOverlapLookupRange(
  target: CalendarOverlapTarget,
): Pick<CalendarOverlapTarget, "end" | "start"> {
  return {
    end: target.lookupEnd ?? target.end,
    start: target.lookupStart ?? target.start,
  };
}

function findOverlappingBusyEvents(
  target: CalendarOverlapTarget,
  candidates: CalendarEvent[],
): CalendarEvent[] {
  const targetRange = parseEventTimeRange(target);
  if (!targetRange) {
    return [];
  }
  const targetRanges = getTargetOverlapRanges(target, targetRange, candidates);

  return candidates
    .filter((candidate) => isOverlappingBusyEvent(target, targetRanges, candidate))
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
  targetRanges: EventTimeRange[],
  candidate: CalendarEvent,
): boolean {
  if (isTargetEvent(target, candidate)) {
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

  return targetRanges.some(
    (targetRange) =>
      targetRange.start < candidateRange.end && targetRange.end > candidateRange.start,
  );
}

function getTargetOverlapRanges(
  target: CalendarOverlapTarget,
  targetRange: EventTimeRange,
  candidates: CalendarEvent[],
): EventTimeRange[] {
  if (!target.seriesMasterId) {
    return [targetRange];
  }

  const ranges = new Map<string, EventTimeRange>();
  ranges.set(`${target.start}:${target.end}`, targetRange);

  for (const candidate of candidates) {
    if (!isTargetEvent(target, candidate) || candidate.cancelled) {
      continue;
    }

    const candidateRange = parseEventTimeRange(candidate);
    if (candidateRange) {
      ranges.set(`${candidate.start}:${candidate.end}`, candidateRange);
    }
  }

  return [...ranges.values()].toSorted((left, right) => left.start - right.start);
}

function isTargetEvent(target: CalendarOverlapTarget, candidate: CalendarEvent): boolean {
  if (candidate.calendarId !== target.calendarId) {
    return false;
  }

  if (candidate.id === target.eventId) {
    return true;
  }

  if (!target.seriesMasterId) {
    return false;
  }

  return (
    candidate.id === target.seriesMasterId || candidate.seriesMasterId === target.seriesMasterId
  );
}

function getSeriesLookupEnd(event: CalendarEvent): string {
  const startTime = new Date(event.start).getTime();
  const endTime = new Date(event.end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || startTime >= endTime) {
    return event.end;
  }

  const fallbackEnd = endTime + SERIES_LOOKUP_DAYS * DAY_MS;
  const recurrenceEnd = getRecurrenceLookupEnd(event, startTime, endTime - startTime);
  return new Date(Math.max(endTime, recurrenceEnd ?? fallbackEnd)).toISOString();
}

function getRecurrenceLookupEnd(
  event: CalendarEvent,
  startTime: number,
  duration: number,
): null | number {
  const recurrence = event.recurrence;
  if (!recurrence) {
    return null;
  }

  if (recurrence.range.type === "endDate" && recurrence.range.endDate) {
    const endDate = new Date(`${recurrence.range.endDate}T00:00:00.000Z`).getTime();
    return Number.isNaN(endDate) ? null : endDate + DAY_MS + duration;
  }

  if (recurrence.range.type !== "numbered" || !recurrence.range.numberOfOccurrences) {
    return null;
  }

  const interval = recurrence.pattern.interval;
  const occurrences = recurrence.range.numberOfOccurrences;
  const daysPerInterval = getRecurrenceDaysPerInterval(recurrence.pattern.type);
  return startTime + Math.max(occurrences - 1, 0) * interval * daysPerInterval * DAY_MS + duration;
}

function getRecurrenceDaysPerInterval(patternType: RecurrencePatternType): number {
  switch (patternType) {
    case "daily": {
      return 1;
    }
    case "weekly": {
      return 7;
    }
    case "absoluteMonthly": {
      return 31;
    }
    case "absoluteYearly": {
      return 366;
    }
  }
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
  getCalendarOverlapLookupRange,
  hasValidOverlapRange,
  toCalendarOverlapTarget,
  type CalendarOverlapTarget,
};
