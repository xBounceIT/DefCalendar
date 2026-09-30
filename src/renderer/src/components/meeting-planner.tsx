import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-regular-svg-icons";
import type { AttendeeAvailability } from "@shared/attendee-availability";
import type { EventParticipant, UserSettings } from "@shared/schemas";
import { toDateTimeInputValue } from "@shared/calendar";
import { formatLocalizedDate } from "../date-formatting";
import {
  HALF_HOUR,
  getPlannerDay,
  getAvailabilityInRange,
  isUnavailable,
  snapPlannerRange,
  movePlannerRange,
  toPlannerInput,
} from "../meeting-planner";
import { getSchedulingSlots } from "../scheduling-assistant";
import ContactAvatar from "./contact-avatar";
import DatePicker from "./date-picker";

const SLOT_HEIGHT = 32;

function DayNavigationIcon({ forward }: { forward: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" transform={`rotate(${forward ? -90 : 90} 12 12)`} />
    </svg>
  );
}

function DurationIcon({ increase = false }: { increase?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M5 12h14" />
      {increase && <path d="M12 5v14" />}
    </svg>
  );
}

export default function MeetingPlanner({
  startInput,
  endInput,
  allDay,
  participants,
  availability,
  loading,
  disabled,
  homeAccountId,
  timeFormat,
  onChange,
  onDateChange,
}: {
  startInput: string;
  endInput: string;
  allDay: boolean;
  participants: EventParticipant[];
  availability: AttendeeAvailability[];
  loading: boolean;
  disabled: boolean;
  homeAccountId?: string;
  timeFormat: UserSettings["timeFormat"];
  onChange: (range: { startInput: string; endInput: string }) => void;
  onDateChange: (date: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [focusedEmail, setFocusedEmail] = useState<string | null>(null);
  const popupId = useId();
  const peopleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    edge: "start" | "end" | "move";
    pointerId: number;
    y: number;
    scroll: number;
    start: number;
    end: number;
    original: { startInput: string; endInput: string };
    latest: { startInput: string; endInput: string };
  } | null>(null);
  const day = getPlannerDay(startInput);
  const dayStart = day.start.getTime();
  const dayEnd = day.end.getTime();
  const start = allDay ? dayStart : new Date(startInput).getTime();
  const end = allDay ? getPlannerDay(endInput).end.getTime() : new Date(endInput).getTime();
  const count = Math.round((dayEnd - dayStart) / HALF_HOUR);
  const height = count * SLOT_HEIGHT;
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const availabilityByEmail = useMemo(
    () => new Map(availability.map((item) => [item.email.toLowerCase(), item])),
    [availability],
  );
  const daySlots = useMemo(
    () =>
      new Map(
        availability.map((item) => [
          item.email.toLowerCase(),
          item.schedule
            ? getSchedulingSlots(item, dayStart, dayEnd)
            : Array.from({ length: count }, () => item.status),
        ]),
      ),
    [availability, dayStart, dayEnd, count],
  );
  const people = participants.map((person, index) => ({
    ...person,
    email: person.email?.trim() || null,
    key: person.email || `participant-${index}`,
    status: loading
      ? ("unknown" as const)
      : getAvailabilityInRange(
          availabilityByEmail.get(person.email?.trim().toLowerCase() ?? ""),
          start,
          end,
        ),
  }));
  const conflicts = people.filter((person) => isUnavailable(person.status)).length;
  const uncertain =
    loading || people.length === 0 || people.some((person) => person.status === "unknown");
  const selectionStatus = conflicts ? "busy" : uncertain ? "unknown" : "free";
  const selectionLabel = conflicts
    ? t("eventEditor.planner.conflicts", { count: conflicts })
    : uncertain
      ? t("eventEditor.planner.unverified")
      : t("eventEditor.planner.everyoneFree");
  const focusedPerson = focusedEmail
    ? people.find((person) => person.email === focusedEmail)
    : undefined;
  const visiblePeople = focusedPerson ? [focusedPerson] : people;
  const time = (value: number) =>
    formatLocalizedDate(
      new Date(value),
      {
        hour: "2-digit",
        minute: "2-digit",
        ...(count !== 48 ? { timeZoneName: "shortOffset" as const } : {}),
      },
      timeFormat,
    );
  const label = (status: string) => t(`eventEditor.attendeeAvailability.${status}`);
  const personLabel = (person: Pick<EventParticipant, "name" | "email">) =>
    person.name || person.email || t("eventEditor.planner.unnamed");
  const avatar = (person: { email: string | null; name: string | null }) =>
    person.email ? (
      <ContactAvatar
        className="meeting-planner__avatar"
        contact={{
          email: person.email,
          name: person.name ?? null,
          userPrincipalName: person.email,
        }}
        homeAccountId={homeAccountId}
      />
    ) : (
      <span className="meeting-planner__avatar" aria-hidden="true">
        <FontAwesomeIcon icon={faUser} />
      </span>
    );

  useEffect(() => {
    if (disabled || allDay) {
      drag.current = null;
    }
  }, [disabled, allDay]);

  useEffect(() => {
    if (
      drag.current &&
      (drag.current.latest.startInput !== startInput || drag.current.latest.endInput !== endInput)
    ) {
      drag.current = null;
    }
  }, [startInput, endInput]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) {
      const previousScroll = scroll.scrollTop;
      scroll.scrollTop = Math.max(
        0,
        ((new Date(startInput).getTime() - getPlannerDay(startInput).start.getTime()) / HALF_HOUR) *
          SLOT_HEIGHT -
          96,
      );
      if (drag.current) {
        drag.current.scroll += scroll.scrollTop - previousScroll;
      }
    }
  }, [startInput.slice(0, 10), allDay]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    const outside = (event: MouseEvent) => {
      if (!peopleRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", outside);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        peopleRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);

  const changeRange = (range: { startInput: string; endInput: string }) => {
    if (drag.current) {
      drag.current.latest = range;
    }
    onChange(range);
  };
  const applyEdge = (edge: "start" | "end", value: number, baseStart: number, baseEnd: number) => {
    const nextStart =
      edge === "start" ? Math.max(dayStart, Math.min(value, baseEnd - HALF_HOUR)) : baseStart;
    const nextEnd = edge === "end" ? Math.max(baseStart + HALF_HOUR, value) : baseEnd;
    changeRange({
      startInput: toPlannerInput(nextStart),
      endInput: toPlannerInput(nextEnd),
    });
  };
  const resizeBy = (edge: "start" | "end", delta: number) => {
    if (disabled || allDay) {
      return;
    }
    const snapped = snapPlannerRange(startInput, endInput);
    const baseStart = new Date(snapped.startInput).getTime();
    const baseEnd = new Date(snapped.endInput).getTime();
    applyEdge(edge, (edge === "start" ? baseStart : baseEnd) + delta, baseStart, baseEnd);
  };
  const resizeKey = (event: React.KeyboardEvent, edge: "start" | "end") => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const delta = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -HALF_HOUR : HALF_HOUR;
    resizeBy(edge, delta);
  };
  const moveBy = (delta: number) => {
    if (disabled || allDay || !valid) {
      return;
    }
    const snapped = snapPlannerRange(startInput, endInput);
    const target = new Date(snapped.startInput).getTime() + delta;
    onChange(movePlannerRange(startInput, endInput, target));
  };
  const moveKey = (event: React.KeyboardEvent) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    moveBy(["ArrowUp", "ArrowLeft"].includes(event.key) ? -HALF_HOUR : HALF_HOUR);
  };
  const dragDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    edge: "start" | "end" | "move",
  ) => {
    if (event.button !== 0 || disabled || allDay || drag.current) {
      return;
    }
    event.preventDefault();
    const snapped = snapPlannerRange(startInput, endInput);
    const range =
      edge === "move"
        ? movePlannerRange(startInput, endInput, new Date(snapped.startInput).getTime())
        : snapped;
    drag.current = {
      edge,
      pointerId: event.pointerId,
      y: event.clientY,
      scroll: scrollRef.current?.scrollTop ?? 0,
      start: new Date(range.startInput).getTime(),
      end: new Date(range.endInput).getTime(),
      original: { startInput, endInput },
      latest: range,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(range);
  };
  const dragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || disabled || allDay) {
      return;
    }
    const scroll = scrollRef.current;
    if (scroll) {
      const bounds = scroll.getBoundingClientRect();
      if (event.clientY > bounds.bottom - 24) {
        scroll.scrollTop += SLOT_HEIGHT;
      }
      if (event.clientY < bounds.top + 24) {
        scroll.scrollTop -= SLOT_HEIGHT;
      }
    }
    const delta =
      Math.round(
        (event.clientY - current.y + (scroll?.scrollTop ?? 0) - current.scroll) / SLOT_HEIGHT,
      ) * HALF_HOUR;
    if (current.edge === "move") {
      const target = Math.max(dayStart, Math.min(dayEnd - HALF_HOUR, current.start + delta));
      changeRange({
        startInput: toPlannerInput(target),
        endInput: toPlannerInput(target + current.end - current.start),
      });
      return;
    }
    applyEdge(
      current.edge,
      Math.min(dayEnd, (current.edge === "start" ? current.start : current.end) + delta),
      current.start,
      current.end,
    );
  };
  const dragEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
    }
  };
  const dragCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      onChange(drag.current.original);
      drag.current = null;
    }
  };
  const navigate = (delta: number) => {
    const next = new Date(day.start);
    next.setDate(next.getDate() + delta);
    if (!Number.isFinite(next.getTime()) || next.getFullYear() < 1 || next.getFullYear() > 9999) {
      return;
    }
    changeDay(toDateTimeInputValue(next.toISOString(), true));
  };
  const changeDay = (date: string) => {
    drag.current = null;
    onDateChange(date);
  };

  return (
    <div className="meeting-planner" aria-label={t("eventEditor.planner.title")}>
      <header className="meeting-planner__header">
        <button
          className="icon-button"
          type="button"
          aria-label={t("eventEditor.planner.previousDay")}
          disabled={disabled}
          onClick={() => navigate(-1)}
        >
          <DayNavigationIcon forward={false} />
        </button>
        <DatePicker
          variant="inline"
          id={`${popupId}-day`}
          label={t("eventEditor.planner.day")}
          value={startInput.slice(0, 10)}
          disabled={disabled}
          onChange={changeDay}
        />
        <button
          className="icon-button"
          type="button"
          aria-label={t("eventEditor.planner.nextDay")}
          disabled={disabled}
          onClick={() => navigate(1)}
        >
          <DayNavigationIcon forward />
        </button>
      </header>
      <div className="meeting-planner__legend">
        <span className="meeting-planner__legend-busy">{t("eventEditor.planner.busy")}</span>
        {loading && <span>{t("eventEditor.planner.loading")}</span>}
      </div>
      {focusedPerson && (
        <div className="meeting-planner__filter">
          <span className="meeting-planner__filter-person">
            <span>
              {t("eventEditor.planner.viewingCalendar", { name: personLabel(focusedPerson) })}
            </span>
          </span>
          <button
            type="button"
            className="meeting-planner__filter-reset"
            onClick={() => setFocusedEmail(null)}
          >
            {t("eventEditor.planner.showEveryone")}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      )}
      <div className="meeting-planner__scroll" ref={scrollRef}>
        {Number.isFinite(dayStart) && (
          <div className="meeting-planner__grid" style={{ height }}>
            {Array.from({ length: count }, (_, index) => {
              const slotStart = dayStart + index * HALF_HOUR;
              const statuses = visiblePeople.map((person) => ({
                person,
                status: loading
                  ? "unknown"
                  : (daySlots.get(person.email?.toLowerCase() ?? "")?.[index] ?? "unknown"),
              }));
              const busyPeople = statuses.filter((item) => isUnavailable(item.status));
              const status = busyPeople.length
                ? "busy"
                : loading ||
                    statuses.length === 0 ||
                    statuses.some((item) => item.status === "unknown")
                  ? "unknown"
                  : "free";
              const description = `${time(slotStart)} – ${time(slotStart + HALF_HOUR)} · ${statuses.map(({ person, status }) => `${personLabel(person)}: ${label(status)}`).join(", ")}`;
              return (
                <div className="meeting-planner__row" key={slotStart}>
                  <span className="meeting-planner__hour">
                    {new Date(slotStart).getMinutes() === 0 ? time(slotStart) : ""}
                  </span>
                  <button
                    type="button"
                    className={`meeting-planner__slot meeting-planner__slot--${status}`}
                    aria-label={description}
                    title={description}
                    disabled={disabled || allDay}
                    onClick={() => onChange(movePlannerRange(startInput, endInput, slotStart))}
                  />
                </div>
              );
            })}
            {valid && (
              <div
                className={`meeting-planner__selection meeting-planner__selection--${selectionStatus}`}
                style={{
                  top: Math.max(0, ((start - dayStart) / HALF_HOUR) * SLOT_HEIGHT),
                  height: (Math.min(dayEnd - start, end - start) / HALF_HOUR) * SLOT_HEIGHT,
                }}
              >
                <button
                  type="button"
                  className="meeting-planner__move"
                  aria-label={t("eventEditor.planner.move")}
                  aria-describedby={`${popupId}-selection-time ${popupId}-selection-status`}
                  title={t("eventEditor.planner.moveHint")}
                  disabled={disabled || allDay}
                  onKeyDown={moveKey}
                  onPointerDown={(event) => dragDown(event, "move")}
                  onPointerMove={dragMove}
                  onPointerUp={dragEnd}
                  onLostPointerCapture={dragEnd}
                  onPointerCancel={dragCancel}
                >
                  <span
                    className="meeting-planner__selection-time"
                    id={`${popupId}-selection-time`}
                  >
                    {allDay
                      ? t("eventEditor.allDay")
                      : `${time(start)} – ${time(end)}${end > dayEnd ? ` · ${t("eventEditor.planner.continues")}` : ""}`}
                  </span>
                  <span
                    className="meeting-planner__selection-status"
                    id={`${popupId}-selection-status`}
                    role="status"
                  >
                    {selectionLabel}
                  </span>
                </button>
                {!allDay &&
                  (["start", "end"] as const)
                    .filter((edge) => edge !== "end" || end <= dayEnd)
                    .map((edge) => (
                      <button
                        key={edge}
                        type="button"
                        className={`meeting-planner__resize meeting-planner__resize--${edge}`}
                        aria-label={
                          edge === "start"
                            ? t("eventEditor.planner.resizeStart")
                            : t("eventEditor.planner.resizeEnd")
                        }
                        title={t("eventEditor.planner.resizeHint")}
                        disabled={disabled}
                        onKeyDown={(event) => resizeKey(event, edge)}
                        onPointerDown={(event) => dragDown(event, edge)}
                        onPointerMove={dragMove}
                        onPointerUp={dragEnd}
                        onLostPointerCapture={dragEnd}
                        onPointerCancel={dragCancel}
                      />
                    ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="meeting-planner__duration">
        <span>
          {allDay
            ? t("eventEditor.allDay")
            : t("eventEditor.planner.duration", {
                count: valid ? Math.round((end - start) / 60_000) : 0,
              })}
        </span>
        <button
          type="button"
          className="icon-button"
          disabled={disabled || allDay || !valid || end - start <= HALF_HOUR}
          aria-label={t("eventEditor.planner.shorten")}
          onClick={() => resizeBy("end", -HALF_HOUR)}
        >
          <DurationIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={disabled || allDay || !valid}
          aria-label={t("eventEditor.planner.extend")}
          onClick={() => resizeBy("end", HALF_HOUR)}
        >
          <DurationIcon increase />
        </button>
      </div>
      <div className="meeting-planner__people" ref={peopleRef}>
        <button
          type="button"
          className="meeting-planner__pill"
          aria-label={t("eventEditor.planner.participants")}
          aria-expanded={expanded}
          aria-controls={popupId}
          onClick={() => setExpanded(!expanded)}
        >
          {people.map((person) => (
            <span
              key={person.key}
              className="meeting-planner__person"
              title={`${personLabel(person)}: ${label(person.status)}`}
            >
              {avatar(person)}
              <span className={`meeting-planner__badge meeting-planner__badge--${person.status}`} />
            </span>
          ))}
          {people.length === 0 && <span>{t("eventEditor.noAttendees")}</span>}
        </button>
        {expanded && (
          <div className="meeting-planner__popup" id={popupId}>
            <span className="meeting-planner__popup-hint">
              {t("eventEditor.planner.personHint")}
            </span>
            {people.map((person) => (
              <button
                type="button"
                className="meeting-planner__person-detail"
                key={person.key}
                disabled={!person.email}
                aria-label={`${personLabel(person)}${person.email ? ` · ${person.email}` : ""} · ${loading ? t("eventEditor.attendeeAvailability.loading") : label(person.status)}`}
                aria-pressed={focusedEmail === person.email}
                onClick={() => {
                  setFocusedEmail(focusedEmail === person.email ? null : person.email);
                  setExpanded(false);
                }}
              >
                {avatar(person)}
                <span>
                  <strong>{personLabel(person)}</strong>
                  <small>{person.email}</small>
                  <small
                    title={
                      person.status === "unknown"
                        ? t("eventEditor.availabilityUnknownHint")
                        : undefined
                    }
                  >
                    {loading ? t("eventEditor.attendeeAvailability.loading") : label(person.status)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
