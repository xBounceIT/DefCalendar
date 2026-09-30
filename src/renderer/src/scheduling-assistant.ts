import {
  AVAILABILITY_STATUS_PRIORITY,
  type AttendeeAvailability,
} from "@shared/attendee-availability";
import type { Availability, EventParticipant } from "@shared/schemas";
import { HALF_HOUR, getPlannerDay, getAvailabilityInRange } from "./meeting-planner";

export type SchedulingView = "day" | "week" | "month";

export function getSchedulingWindow(date: string, view: SchedulingView = "day") {
  const first = getPlannerDay(date);
  const start = new Date(first.start);
  if (view === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (view === "month") {
    start.setDate(1);
  }
  const end = new Date(start);
  if (view === "month") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setDate(end.getDate() + (view === "week" ? 7 : 2));
  }
  return { start: start.getTime(), end: end.getTime() };
}

export function getSchedulingDays(window: { start: number; end: number }) {
  const days: { start: number; end: number }[] = [];
  const day = new Date(window.start);
  while (day.getTime() < window.end) {
    const start = day.getTime();
    day.setDate(day.getDate() + 1);
    days.push({ start, end: day.getTime() });
  }
  return days;
}

export function shiftSchedulingPeriod(date: string, view: SchedulingView, direction: number) {
  const range = getSchedulingWindow(date, view);
  const next = new Date(view === "day" ? getPlannerDay(date).start : range.start);
  if (view === "month") {
    next.setMonth(next.getMonth() + direction);
  } else {
    next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
  }
  return next;
}

export function getSchedulingRuns<T>(slots: T[]) {
  const runs: { status: T; from: number; to: number }[] = [];
  slots.forEach((status, index) => {
    const last = runs.at(-1);
    if (last?.status === status) {
      last.to = index + 1;
    } else {
      runs.push({ status, from: index, to: index + 1 });
    }
  });
  return runs;
}

export function isWorkingSlot(timestamp: number) {
  const date = new Date(timestamp);
  return date.getDay() !== 0 && date.getDay() !== 6 && date.getHours() >= 9 && date.getHours() < 18;
}

export function getSchedulingSlots(
  item: AttendeeAvailability | undefined,
  start: number,
  end: number,
) {
  const count = Math.ceil((end - start) / HALF_HOUR);
  const schedule = item?.schedule;
  const coverageStart = schedule ? Date.parse(schedule.start) : Number.NaN;
  const coverageEnd = schedule ? Date.parse(schedule.end) : Number.NaN;
  const slots = Array.from({ length: count }, (_, index): Availability => {
    const from = start + index * HALF_HOUR;
    return from >= coverageStart && from + HALF_HOUR <= coverageEnd ? "free" : "unknown";
  });
  for (const event of schedule?.slots ?? []) {
    const from = Math.max(0, Math.floor((Date.parse(event.start) - start) / HALF_HOUR));
    const to = Math.min(count, Math.ceil((Date.parse(event.end) - start) / HALF_HOUR));
    for (let index = from; index < to; index++) {
      const covered =
        start + index * HALF_HOUR >= coverageStart &&
        start + (index + 1) * HALF_HOUR <= coverageEnd;
      if (
        covered &&
        AVAILABILITY_STATUS_PRIORITY.indexOf(event.status) >
          AVAILABILITY_STATUS_PRIORITY.indexOf(slots[index]!)
      ) {
        slots[index] = event.status;
      }
    }
  }
  return slots;
}

export function getSchedulingSuggestions({
  participants,
  organizerEmail,
  availability,
  start,
  end,
  duration,
  workingHoursOnly,
}: {
  participants: EventParticipant[];
  organizerEmail?: string;
  availability: AttendeeAvailability[];
  start: number;
  end: number;
  duration: number;
  workingHoursOnly: boolean;
}) {
  if (!hasSchedulingParticipants(participants, organizerEmail)) {
    return [];
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > end - start) {
    return [];
  }
  const required = participants.filter((person) => person.type !== "optional");
  if (!required.length) {
    return [];
  }
  const byEmail = new Map(availability.map((item) => [item.email.toLowerCase(), item]));
  const gridDuration = duration % HALF_HOUR === 0;
  const blocked = Array<number>(Math.ceil((end - start) / HALF_HOUR)).fill(0);
  if (gridDuration) {
    for (const person of required) {
      const slots = getSchedulingSlots(
        byEmail.get(person.email?.trim().toLowerCase() ?? ""),
        start,
        end,
      );
      slots.forEach((status, index) => {
        if (status !== "free" && status !== "workingElsewhere") {
          blocked[index] = 1;
        }
      });
    }
  }
  const conflicts = [0];
  blocked.forEach((value) => conflicts.push(conflicts.at(-1)! + value));
  const suggestions: number[] = [];
  for (let time = start; time + duration <= end; time += HALF_HOUR) {
    if (workingHoursOnly) {
      let working = true;
      for (let slot = time; slot < time + duration; slot += HALF_HOUR) {
        if (!isWorkingSlot(slot)) {
          working = false;
          break;
        }
      }
      if (!working) {
        continue;
      }
    }
    if (
      gridDuration
        ? conflicts[(time - start + duration) / HALF_HOUR] === conflicts[(time - start) / HALF_HOUR]
        : required.every((person) => {
            const item = byEmail.get(person.email?.trim().toLowerCase() ?? "");
            if (!item?.schedule) {
              return false;
            }
            const status = getAvailabilityInRange(item, time, time + duration);
            return status === "free" || status === "workingElsewhere";
          })
    ) {
      suggestions.push(time);
    }
  }
  return suggestions;
}

export function hasSchedulingParticipants(
  participants: EventParticipant[],
  organizerEmail?: string,
) {
  const organizer = organizerEmail?.trim().toLowerCase();
  return participants.some((person) => {
    const email = person.email?.trim().toLowerCase();
    return Boolean(email && email !== organizer);
  });
}
