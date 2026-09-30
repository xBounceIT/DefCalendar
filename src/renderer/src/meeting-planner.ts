import {
  AVAILABILITY_STATUS_PRIORITY as PRIORITY,
  type AttendeeAvailability,
} from "@shared/attendee-availability";
import type { Availability } from "@shared/schemas";
import { toDateTimeInputValue } from "@shared/calendar";

const HALF_HOUR = 30 * 60 * 1000;
function getPlannerDay(input: string) {
  const start = new Date(`${input.slice(0, 10)}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function getAvailabilityInRange(
  item: AttendeeAvailability | undefined,
  start: number,
  end: number,
): Availability {
  if (!item || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "unknown";
  }
  if (!item.schedule) {
    return item.status;
  }
  if (start < Date.parse(item.schedule.start) || end > Date.parse(item.schedule.end)) {
    return "unknown";
  }
  return item.schedule.slots.reduce<Availability>((status, slot) => {
    if (Date.parse(slot.start) >= end || Date.parse(slot.end) <= start) {
      return status;
    }
    return PRIORITY.indexOf(slot.status) > PRIORITY.indexOf(status) ? slot.status : status;
  }, "free");
}

function isUnavailable(status: Availability) {
  return status === "busy" || status === "oof" || status === "tentative";
}

function toPlannerInput(timestamp: number) {
  const date = new Date(timestamp);
  const input = toDateTimeInputValue(date.toISOString(), false);
  if (new Date(input).getTime() === timestamp) {
    return input;
  }
  const offset = -date.getTimezoneOffset();
  return `${input}${offset >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}

function snapPlannerRange(startInput: string, endInput: string) {
  const start = new Date(startInput);
  const end = new Date(endInput);
  for (const date of [start, end]) {
    date.setTime(
      date.getTime() +
        (Math.round(date.getMinutes() / 30) * 30 - date.getMinutes()) * 60_000 -
        date.getSeconds() * 1000 -
        date.getMilliseconds(),
    );
  }
  if (end.getTime() <= start.getTime()) {
    end.setTime(start.getTime() + HALF_HOUR);
  }
  return {
    startInput: toPlannerInput(start.getTime()),
    endInput: toPlannerInput(end.getTime()),
  };
}

function movePlannerRange(startInput: string, endInput: string, target: number) {
  const duration = Math.max(
    HALF_HOUR,
    Math.ceil((new Date(endInput).getTime() - new Date(startInput).getTime()) / HALF_HOUR) *
      HALF_HOUR,
  );
  return {
    startInput: toPlannerInput(target),
    endInput: toPlannerInput(target + duration),
  };
}

export {
  HALF_HOUR,
  getPlannerDay,
  getAvailabilityInRange,
  isUnavailable,
  snapPlannerRange,
  movePlannerRange,
  toPlannerInput,
};
