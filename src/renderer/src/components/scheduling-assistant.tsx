import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttendeeAvailability } from "@shared/attendee-availability";
import type { Availability, EventParticipant, UserSettings } from "@shared/schemas";
import { toDateTimeInputValue } from "@shared/calendar";
import { formatLocalizedDate } from "../date-formatting";
import {
  HALF_HOUR,
  getAvailabilityInRange,
  getPlannerDay,
  movePlannerRange,
  snapPlannerRange,
  toPlannerInput,
  isUnavailable,
} from "../meeting-planner";
import {
  getSchedulingWindow,
  getSchedulingSuggestions,
  hasSchedulingParticipants,
  getSchedulingDays,
  getSchedulingRuns,
  getSchedulingSlots,
  shiftSchedulingPeriod,
  type SchedulingView,
  getWorkingSlotChecker,
} from "../scheduling-assistant";
import ContactAvatar from "./contact-avatar";

type ParticipantType = EventParticipant["type"];
interface Range {
  startInput: string;
  endInput: string;
}

function isSupportedRange(range: Range) {
  return [range.startInput, range.endInput].every((value) => {
    const year = new Date(value).getFullYear();
    return year >= 1 && year <= 9999;
  });
}

function Chevron({ forward = false }: { forward?: boolean }) {
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
      <polyline points={forward ? "9 6 15 12 9 18" : "15 6 9 12 15 18"} />
    </svg>
  );
}

export default function SchedulingAssistant({
  date,
  view,
  onViewChange,
  startInput,
  endInput,
  allDay,
  participants,
  organizerEmail,
  availability,
  loading,
  disabled,
  homeAccountId,
  timeFormat,
  controls,
  renderParticipantInput,
  onDateChange,
  onChange: onRangeChange,
  onRemove,
  onBack,
}: {
  date: string;
  view: SchedulingView;
  onViewChange: (view: SchedulingView) => void;
  startInput: string;
  endInput: string;
  allDay: boolean;
  participants: EventParticipant[];
  organizerEmail?: string;
  availability: AttendeeAvailability[];
  loading: boolean;
  disabled: boolean;
  homeAccountId?: string;
  timeFormat: UserSettings["timeFormat"];
  controls: React.ReactNode;
  renderParticipantInput: (type: ParticipantType) => React.ReactNode;
  onDateChange: (date: string) => void;
  onChange: (range: Range) => void;
  onRemove: (index: number) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [workingHoursOnly, setWorkingHoursOnly] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const optionsRef = useRef<HTMLDetailsElement>(null);
  const [collapsed, setCollapsed] = useState<ParticipantType[]>([]);
  const [dragWindow, setDragWindow] = useState<{
    date: string;
    view: SchedulingView;
    end: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const revealRange = (range: Range) => {
    if (view === "day" && Date.parse(range.startInput) >= getSchedulingWindow(date).end) {
      onDateChange(range.startInput.slice(0, 10));
    }
  };
  const onChange = (range: Range) => {
    if (isSupportedRange(range)) {
      onRangeChange(range);
      if (!drag.current) {
        revealRange(range);
      }
    }
  };
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        optionsRef.current.open = false;
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);
  const drag = useRef<{
    edge: "move" | "start" | "end";
    pointerId: number;
    x: number;
    clientX: number;
    scroll: number;
    start: number;
    end: number;
    original: Range;
    latest: Range;
    pending: Range[];
  } | null>(null);
  const dragFrame = useRef<number | null>(null);
  const clearDrag = () => {
    drag.current = null;
    setDragWindow(null);
    if (dragFrame.current !== null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }
  };
  useEffect(() => clearDrag, []);
  const start = allDay ? getPlannerDay(startInput).start.getTime() : Date.parse(startInput);
  const end = allDay ? getPlannerDay(endInput).end.getTime() : Date.parse(endInput);
  const window = getSchedulingWindow(date, view, { start, end });
  if (dragWindow?.date === date && dragWindow.view === view) {
    window.end = Math.max(window.end, dragWindow.end);
  }
  const days = getSchedulingDays(window);
  const overview = view !== "day";
  const cellWidth = view === "day" ? 36 : view === "week" ? 2.5 : 1.5;
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const duration = valid
    ? Math.max(HALF_HOUR, Math.ceil((end - start) / HALF_HOUR) * HALF_HOUR)
    : HALF_HOUR;
  const count = Math.round((window.end - window.start) / HALF_HOUR);
  const width = count * cellWidth;
  const byEmail = useMemo(
    () => new Map(availability.map((item) => [item.email.toLowerCase(), item])),
    [availability],
  );
  const canSuggest = hasSchedulingParticipants(participants, organizerEmail);
  const workingHours = byEmail.get(organizerEmail?.trim().toLowerCase() ?? "")?.workingHours;
  const isWorkingSlot = useMemo(() => getWorkingSlotChecker(workingHours), [workingHours]);
  const suggestions = useMemo(
    () =>
      loading || allDay || !canSuggest
        ? []
        : getSchedulingSuggestions({
            participants,
            organizerEmail,
            availability,
            ...window,
            duration,
            workingHoursOnly,
          }),
    [
      participants,
      organizerEmail,
      canSuggest,
      availability,
      window.start,
      window.end,
      duration,
      workingHoursOnly,
      loading,
      allDay,
    ],
  );
  const suggestedTimes = useMemo(() => new Set(suggestions), [suggestions]);
  const daySuggestions = days.map((day) =>
    suggestions.filter((value) => value >= day.start && value < day.end),
  );
  const highlights = useMemo(
    () => ({
      suggestions: getSchedulingRuns(
        Array.from({ length: count }, (_, index) =>
          suggestedTimes.has(window.start + index * HALF_HOUR),
        ),
      ).filter((run) => run.status),
      nonworking: getSchedulingRuns(
        Array.from(
          { length: count },
          (_, index) => Boolean(workingHours) && !isWorkingSlot(window.start + index * HALF_HOUR),
        ),
      ).filter((run) => run.status),
    }),
    [count, window.start, suggestedTimes, workingHours, isWorkingSlot],
  );
  const people = useMemo(
    () =>
      participants.map((person, sourceIndex) => ({
        ...person,
        sourceIndex,
        slots: getSchedulingSlots(
          loading ? undefined : byEmail.get(person.email?.trim().toLowerCase() ?? ""),
          window.start,
          window.end,
        ),
      })),
    [participants, count, window.start, byEmail, loading],
  );
  const mandatory = people.filter((person) => person.type !== "optional");
  const summary = Array.from({ length: count }, (_, index) => {
    const statuses = mandatory.map((person) => person.slots[index]);
    return statuses.some((status) => isUnavailable(status!))
      ? "busy"
      : statuses.length === 0 || statuses.includes("unknown")
        ? "unknown"
        : "free";
  });
  const time = (value: number) =>
    formatLocalizedDate(
      new Date(value),
      {
        hour: "2-digit",
        minute: "2-digit",
        ...(count !== days.length * 48 ? { timeZoneName: "shortOffset" } : {}),
      },
      timeFormat,
    );
  const dayLabel = (value: number) =>
    formatLocalizedDate(
      new Date(value),
      { weekday: "long", day: "numeric", month: "long" },
      timeFormat,
    );
  const statusLabel = (status: string) => t(`eventEditor.attendeeAvailability.${status}`);
  const select = (target: number) => {
    if (disabled || new Date(target).getFullYear() > 9999) {
      return;
    }
    if (allDay) {
      const next = getPlannerDay(toDateTimeInputValue(new Date(target).toISOString(), true)).start;
      const days = Math.max(
        0,
        Math.round(
          (getPlannerDay(endInput).start.getTime() - getPlannerDay(startInput).start.getTime()) /
            86_400_000,
        ),
      );
      const finish = new Date(next);
      finish.setDate(finish.getDate() + days);
      onChange({
        startInput: toDateTimeInputValue(next.toISOString(), true),
        endInput: toDateTimeInputValue(finish.toISOString(), true),
      });
    } else {
      onChange(movePlannerRange(startInput, endInput, target));
    }
  };
  const navigate = (direction: number) => {
    const next = shiftSchedulingPeriod(date, view, direction);
    if (next.getFullYear() > 0 && next.getFullYear() <= 9999) {
      onDateChange(toDateTimeInputValue(next.toISOString(), true));
    }
  };
  const openDay = (target: number) => {
    if (
      !Number.isFinite(target) ||
      new Date(target).getFullYear() < 1 ||
      new Date(target).getFullYear() > 9999
    ) {
      return;
    }
    onDateChange(toDateTimeInputValue(new Date(target).toISOString(), true));
    onViewChange("day");
  };
  const rowKeyboardTarget = (direction: number) => {
    const next = new Date(allDay ? start : snapPlannerRange(startInput, endInput).startInput);
    if (allDay) {
      next.setDate(next.getDate() + direction);
    } else {
      next.setTime(next.getTime() + direction * HALF_HOUR);
    }
    return Math.max(window.start, Math.min(window.end - HALF_HOUR, next.getTime()));
  };
  useEffect(() => {
    clearDrag();
  }, [date, view]);
  useEffect(() => {
    const current = drag.current;
    if (!current) {
      return;
    }
    const acknowledged = current.pending.findIndex(
      (range) => range.startInput === startInput && range.endInput === endInput,
    );
    if (acknowledged !== -1) {
      current.pending.splice(0, acknowledged + 1);
    } else if (current.latest.startInput !== startInput || current.latest.endInput !== endInput) {
      clearDrag();
    }
  }, [startInput, endInput]);
  useEffect(() => {
    if (scrollRef.current && !drag.current) {
      const target =
        view === "week"
          ? window.start
          : start >= window.start && start < window.end
            ? start
            : window.start + 9 * 60 * 60 * 1000;
      scrollRef.current.scrollLeft = Math.max(
        0,
        ((target - window.start) / HALF_HOUR) * cellWidth - cellWidth * 2,
      );
    }
  }, [date, view, startInput, allDay]);
  useEffect(() => {
    if (disabled || allDay) {
      clearDrag();
    }
  }, [disabled, allDay]);
  const begin = (event: React.PointerEvent<HTMLButtonElement>, edge: "move" | "start" | "end") => {
    if (
      disabled ||
      allDay ||
      !valid ||
      drag.current ||
      (event.button !== 0 && event.button !== -1)
    ) {
      return;
    }
    const snapped =
      edge === "move"
        ? movePlannerRange(
            startInput,
            endInput,
            Date.parse(snapPlannerRange(startInput, endInput).startInput),
          )
        : snapPlannerRange(startInput, endInput);
    if (!isSupportedRange(snapped)) {
      return;
    }
    drag.current = {
      edge,
      pointerId: event.pointerId,
      x: event.clientX,
      clientX: event.clientX,
      scroll: scrollRef.current?.scrollLeft ?? 0,
      start: Date.parse(snapped.startInput),
      end: Date.parse(snapped.endInput),
      original: { startInput, endInput },
      latest: snapped,
      pending: [snapped],
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragWindow({ date, view, end: window.end });
    event.preventDefault();
    onChange(snapped);
    dragFrame.current = requestAnimationFrame((timestamp) => scrollDrag(timestamp, timestamp));
  };
  const updateDrag = (clientX: number) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    const delta =
      Math.round(
        (clientX - current.x + (scrollRef.current?.scrollLeft ?? 0) - current.scroll) / cellWidth,
      ) * HALF_HOUR;
    let from = current.start,
      to = current.end;
    if (current.edge === "move") {
      from = Math.max(window.start, current.start + delta);
      to = from + current.end - current.start;
    } else if (current.edge === "start") {
      from = Math.max(window.start, Math.min(to - HALF_HOUR, current.start + delta));
    } else {
      to = Math.max(from + HALF_HOUR, current.end + delta);
    }
    const range = { startInput: toPlannerInput(from), endInput: toPlannerInput(to) };
    if (
      !isSupportedRange(range) ||
      (range.startInput === current.latest.startInput && range.endInput === current.latest.endInput)
    ) {
      return;
    }
    current.latest = range;
    current.pending.push(range);
    const nextEnd = getSchedulingWindow(date, view, {
      start: Math.min(current.start, from),
      end: to,
    }).end;
    setDragWindow((currentWindow) =>
      currentWindow && nextEnd > currentWindow.end
        ? { ...currentWindow, end: nextEnd }
        : currentWindow,
    );
    onChange(range);
  };
  const scrollDrag = (timestamp: number, previousTimestamp: number) => {
    dragFrame.current = null;
    const current = drag.current;
    const scroll = scrollRef.current;
    if (!current || !scroll) {
      return;
    }
    const bounds = scroll.getBoundingClientRect();
    if (bounds.width > 220) {
      const direction =
        current.clientX < bounds.left + 220 + cellWidth
          ? -1
          : current.clientX > bounds.right - cellWidth
            ? 1
            : 0;
      const previousScroll = scroll.scrollLeft;
      scroll.scrollLeft +=
        direction * cellWidth * (Math.min(32, timestamp - previousTimestamp) / 100);
      if (scroll.scrollLeft !== previousScroll) {
        updateDrag(current.clientX);
      }
    }
    dragFrame.current = requestAnimationFrame((next) => scrollDrag(next, timestamp));
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || disabled || allDay) {
      return;
    }
    current.clientX = event.clientX;
    updateDrag(event.clientX);
  };
  const finish = (event: React.PointerEvent<HTMLButtonElement>, cancel = false) => {
    if (drag.current?.pointerId !== event.pointerId) {
      return;
    }
    const { original, latest } = drag.current;
    clearDrag();
    if (cancel && !disabled && !allDay) {
      onChange(original);
    } else if (!cancel && !disabled && !allDay) {
      revealRange(latest);
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };
  const adjustKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    edge: "move" | "start" | "end",
  ) => {
    if (disabled || allDay || !valid || !["ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -HALF_HOUR : HALF_HOUR;
    const snapped = snapPlannerRange(startInput, endInput);
    const from = Date.parse(snapped.startInput),
      to = Date.parse(snapped.endInput);
    if (edge === "move") {
      select(Math.max(window.start, from + delta));
    } else if (edge === "start") {
      onChange({
        startInput: toPlannerInput(Math.max(window.start, Math.min(to - HALF_HOUR, from + delta))),
        endInput: snapped.endInput,
      });
    } else {
      onChange({
        startInput: snapped.startInput,
        endInput: toPlannerInput(Math.max(from + HALF_HOUR, to + delta)),
      });
    }
  };
  const pointerProps = (edge: "move" | "start" | "end") => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => begin(event, edge),
    onPointerMove: move,
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => finish(event),
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => finish(event, true),
    onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (drag.current?.pointerId === event.pointerId) {
        clearDrag();
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => adjustKey(event, edge),
  });
  const previousSuggestion = suggestions.findLast((value) => value < start);
  const nextSuggestion = suggestions.find((value) => value > start);
  const segments = (slots: Availability[]) => {
    const runs = getSchedulingRuns(slots).filter(
      (run) => run.status !== "free" && (showDetails || run.status !== "workingElsewhere"),
    );
    return runs.map((run) => (
      <span
        key={run.from}
        className={`scheduling-assistant__busy scheduling-assistant__busy--${!showDetails && isUnavailable(run.status) ? "busy" : run.status}`}
        style={{ left: run.from * cellWidth, width: (run.to - run.from) * cellWidth }}
        title={
          showDetails
            ? `${overview ? `${dayLabel(window.start + run.from * HALF_HOUR)} ` : ""}${time(window.start + run.from * HALF_HOUR)} – ${overview ? `${dayLabel(window.start + run.to * HALF_HOUR)} ` : ""}${time(window.start + run.to * HALF_HOUR)} · ${statusLabel(run.status)}`
            : statusLabel(isUnavailable(run.status) ? "busy" : run.status)
        }
      />
    ));
  };
  const groupLabels = {
    required: t("eventEditor.requiredAttendees"),
    optional: t("eventEditor.optionalAttendees"),
    resource: t("eventEditor.assistant.rooms"),
  };
  const selectionVisible = valid && start < window.end && end > window.start;
  const selectionStatuses = mandatory.map((person) => {
    const item = byEmail.get(person.email?.trim().toLowerCase() ?? "");
    return loading || !item?.schedule ? "unknown" : getAvailabilityInRange(item, start, end);
  });
  const hasConflict = selectionStatuses.some(isUnavailable);
  const uncertain = !selectionStatuses.length || selectionStatuses.includes("unknown");
  const selectionStart = overview ? getPlannerDay(startInput).start.getTime() : start;
  const selectionEnd =
    overview && new Date(end).getHours() + new Date(end).getMinutes() !== 0
      ? getPlannerDay(toPlannerInput(end)).end.getTime()
      : end;
  const viewLabels = {
    day: t("eventEditor.assistant.dayView"),
    week: t("eventEditor.assistant.weekView"),
    month: t("eventEditor.assistant.monthView"),
  };
  return (
    <div
      className={`scheduling-assistant${overview ? " scheduling-assistant--overview" : ""}`}
      aria-label={t("eventEditor.assistant.title")}
    >
      <div className="scheduling-assistant__toolbar">
        <button type="button" className="ghost-button" onClick={onBack}>
          <Chevron />
          {t("eventEditor.assistant.back")}
        </button>
        <details
          className="scheduling-assistant__options"
          ref={optionsRef}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary
            className="ghost-button"
            aria-haspopup="menu"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (optionsRef.current) {
                  optionsRef.current.open = true;
                  optionsRef.current
                    .querySelector<HTMLButtonElement>("[role=menuitemcheckbox]")
                    ?.focus();
                }
              }
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
              <circle cx="9" cy="6" r="2" fill="var(--surface)" />
              <circle cx="16" cy="12" r="2" fill="var(--surface)" />
              <circle cx="7" cy="18" r="2" fill="var(--surface)" />
            </svg>
            {t("eventEditor.assistant.options")}
            <Chevron forward />
          </summary>
          <div
            role="menu"
            aria-label={t("eventEditor.assistant.options")}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const items = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
                ];
                const index = items.indexOf(event.target as HTMLButtonElement);
                items[
                  (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
                ]?.focus();
              }
            }}
          >
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={workingHoursOnly}
              onClick={() => setWorkingHoursOnly((current) => !current)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 4 4 10-10" />
              </svg>
              {t("eventEditor.assistant.workingHours")}
            </button>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={showDetails}
              onClick={() => setShowDetails((current) => !current)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 4 4 10-10" />
              </svg>
              {t("eventEditor.assistant.detailedData")}
            </button>
          </div>
        </details>
        <div className="view-selector" role="group" aria-label={t("eventEditor.assistant.view")}>
          {(["month", "week", "day"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={`view-button${view === item ? " view-button--active" : ""}`}
              aria-pressed={view === item}
              onClick={() => onViewChange(item)}
            >
              {viewLabels[item]}
            </button>
          ))}
        </div>
        <button type="button" className="primary-button" disabled={disabled} onClick={onBack}>
          {t("eventEditor.assistant.save")}
        </button>
      </div>
      <div className="scheduling-assistant__controls">
        {controls}
        <label className="teams-toggle scheduling-assistant__suggestions-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={showSuggestions}
            onChange={(event) => setShowSuggestions(event.target.checked)}
          />
          <span className="toggle-slider" />
          <span>{t("eventEditor.assistant.suggestions")}</span>
        </label>
        <div className="scheduling-assistant__day-navigation">
          <button
            type="button"
            className="icon-button"
            aria-label={
              overview
                ? t("eventEditor.assistant.previousPeriod")
                : t("eventEditor.planner.previousDay")
            }
            onClick={() => navigate(-1)}
          >
            <Chevron />
          </button>
          {overview && (
            <span>
              {view === "week"
                ? `${formatLocalizedDate(new Date(window.start), { day: "numeric", month: "short" }, timeFormat)} – ${formatLocalizedDate(new Date(window.end - 1), { day: "numeric", month: "short", year: "numeric" }, timeFormat)}`
                : formatLocalizedDate(
                    new Date(window.start),
                    { month: "long", year: "numeric" },
                    timeFormat,
                  )}
            </span>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={
              overview ? t("eventEditor.assistant.nextPeriod") : t("eventEditor.planner.nextDay")
            }
            onClick={() => navigate(1)}
          >
            <Chevron forward />
          </button>
        </div>
      </div>
      <div className="scheduling-assistant__scroll" ref={scrollRef}>
        <div
          className="scheduling-assistant__matrix"
          style={
            {
              width: 220 + width,
              "--cell-width": `${cellWidth}px`,
              "--day-width": `${48 * cellWidth}px`,
            } as React.CSSProperties
          }
        >
          <div className="scheduling-assistant__content">
            <div className="scheduling-assistant__heading">
              <div className="scheduling-assistant__label">{t("eventEditor.assistant.people")}</div>
              <div className="scheduling-assistant__days" style={{ width }}>
                {days.map((day) => (
                  <button
                    type="button"
                    key={day.start}
                    disabled={
                      new Date(day.start).getFullYear() < 1 ||
                      new Date(day.start).getFullYear() > 9999
                    }
                    aria-label={t("eventEditor.assistant.openDay", { day: dayLabel(day.start) })}
                    onClick={() => openDay(day.start)}
                    style={{
                      width: ((day.end - day.start) / HALF_HOUR) * cellWidth,
                    }}
                  >
                    <span>
                      {overview
                        ? formatLocalizedDate(
                            new Date(day.start),
                            { weekday: "short", day: "numeric" },
                            timeFormat,
                          )
                        : dayLabel(day.start)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {!overview && (
              <div className="scheduling-assistant__hours">
                <div className="scheduling-assistant__label" />
                <div className="scheduling-assistant__hour-track">
                  {Array.from({ length: count }, (_, index) => (
                    <span key={index} style={{ width: cellWidth }}>
                      {new Date(window.start + index * HALF_HOUR).getMinutes() === 0
                        ? time(window.start + index * HALF_HOUR)
                        : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="scheduling-assistant__row scheduling-assistant__row--summary">
              <div className="scheduling-assistant__label">
                {overview && !allDay
                  ? t("eventEditor.assistant.suggestedTimes")
                  : t("eventEditor.assistant.availability")}
              </div>
              <div className="scheduling-assistant__summary-track">
                {overview
                  ? days.map((day, index) => (
                      <button
                        type="button"
                        key={day.start}
                        disabled={
                          disabled ||
                          new Date(day.start).getFullYear() < 1 ||
                          new Date(day.start).getFullYear() > 9999
                        }
                        className={`scheduling-assistant__overview-day${showSuggestions && daySuggestions[index]!.length ? " scheduling-assistant__slot--suggested" : ""}`}
                        style={{ width: ((day.end - day.start) / HALF_HOUR) * cellWidth }}
                        aria-label={`${dayLabel(day.start)} · ${!canSuggest ? t("eventEditor.assistant.addParticipantsHint") : loading ? t("eventEditor.planner.loading") : t("eventEditor.assistant.suggestionCount", { count: daySuggestions[index]!.length })}`}
                        onClick={() => (allDay ? select(day.start) : openDay(day.start))}
                      >
                        {loading && canSuggest
                          ? "…"
                          : showSuggestions && daySuggestions[index]!.length
                            ? daySuggestions[index]!.length
                            : "—"}
                      </button>
                    ))
                  : summary.map((status, index) => {
                      const target = window.start + index * HALF_HOUR;
                      return (
                        <button
                          type="button"
                          key={target}
                          disabled={disabled}
                          className={`scheduling-assistant__slot scheduling-assistant__slot--${status}${showSuggestions && suggestedTimes.has(target) ? " scheduling-assistant__slot--suggested" : ""}`}
                          style={{ width: cellWidth }}
                          aria-label={`${time(target)} · ${dayLabel(target)} · ${statusLabel(status)}`}
                          onClick={() => select(target)}
                        />
                      );
                    })}
              </div>
            </div>
            {(["required", "optional", "resource"] as const).map((type) => (
              <React.Fragment key={type}>
                <div className="scheduling-assistant__group">
                  <button
                    type="button"
                    className="scheduling-assistant__label"
                    aria-expanded={!collapsed.includes(type)}
                    onClick={() =>
                      setCollapsed((current) =>
                        current.includes(type)
                          ? current.filter((item) => item !== type)
                          : [...current, type],
                      )
                    }
                  >
                    <Chevron forward={collapsed.includes(type)} />
                    {groupLabels[type]}
                    <span>{people.filter((person) => person.type === type).length}</span>
                  </button>
                </div>
                {!collapsed.includes(type) && (
                  <>
                    {people
                      .filter((person) => person.type === type)
                      .map((person, index) => {
                        const name =
                          person.name || person.email || t("eventEditor.planner.unnamed");
                        const status =
                          loading ||
                          !byEmail.get(person.email?.trim().toLowerCase() ?? "")?.schedule
                            ? "unknown"
                            : getAvailabilityInRange(
                                byEmail.get(person.email?.trim().toLowerCase() ?? ""),
                                start,
                                end,
                              );
                        return (
                          <div
                            className="scheduling-assistant__row"
                            key={`${person.email}-${index}`}
                          >
                            <div className="scheduling-assistant__label scheduling-assistant__person">
                              <ContactAvatar
                                className="meeting-planner__avatar"
                                homeAccountId={homeAccountId}
                                contact={{
                                  email: person.email ?? "",
                                  name: person.name,
                                }}
                              />
                              <span title={person.email ?? undefined}>
                                <strong>{name}</strong>
                                {showDetails && <small>{statusLabel(status)}</small>}
                              </span>
                              {person.email?.toLowerCase() !== organizerEmail?.toLowerCase() && (
                                <button
                                  type="button"
                                  className="scheduling-assistant__remove"
                                  disabled={disabled}
                                  aria-label={`${t("eventEditor.removeAttendee")}: ${name}`}
                                  onClick={() => onRemove(person.sourceIndex)}
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="m6 6 12 12M18 6 6 18" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              className="scheduling-assistant__track"
                              disabled={disabled}
                              aria-label={`${t("eventEditor.assistant.calendarOf", { name })}`}
                              onClick={(event) => {
                                if (overview) {
                                  const bounds = event.currentTarget.getBoundingClientRect();
                                  openDay(
                                    event.detail === 0
                                      ? Math.max(
                                          window.start,
                                          Math.min(window.end - HALF_HOUR, start),
                                        )
                                      : window.start +
                                          Math.max(
                                            0,
                                            Math.min(
                                              count - 1,
                                              Math.floor((event.clientX - bounds.left) / cellWidth),
                                            ),
                                          ) *
                                            HALF_HOUR,
                                  );
                                  return;
                                }
                                if (event.detail === 0 && event.clientX === 0) {
                                  select(rowKeyboardTarget(0));
                                  return;
                                }
                                const bounds = event.currentTarget.getBoundingClientRect();
                                select(
                                  window.start +
                                    Math.max(
                                      0,
                                      Math.min(
                                        count - 1,
                                        Math.floor((event.clientX - bounds.left) / cellWidth),
                                      ),
                                    ) *
                                      HALF_HOUR,
                                );
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                                  event.preventDefault();
                                  select(rowKeyboardTarget(event.key === "ArrowLeft" ? -1 : 1));
                                }
                              }}
                            >
                              {segments(person.slots)}
                            </button>
                          </div>
                        );
                      })}
                    <div className="scheduling-assistant__row scheduling-assistant__row--add">
                      <div className="scheduling-assistant__label">
                        {renderParticipantInput(type)}
                      </div>
                      <div className="scheduling-assistant__empty-track" />
                    </div>
                  </>
                )}
              </React.Fragment>
            ))}
            <div
              className="scheduling-assistant__overlays"
              style={{ left: 220, width }}
              aria-hidden="true"
            >
              {overview &&
                days.map((day) => (
                  <span
                    key={day.start}
                    className="scheduling-assistant__day-divider"
                    style={{ left: ((day.start - window.start) / HALF_HOUR) * cellWidth }}
                  />
                ))}
              {highlights.nonworking.map((run) => (
                <span
                  key={run.from}
                  className="scheduling-assistant__nonworking"
                  style={{ left: run.from * cellWidth, width: (run.to - run.from) * cellWidth }}
                />
              ))}
              {showSuggestions &&
                highlights.suggestions.map((run) => (
                  <span
                    key={run.from}
                    className="scheduling-assistant__suggestion"
                    style={{
                      left: run.from * cellWidth,
                      width: (run.to - run.from) * cellWidth,
                    }}
                  />
                ))}
            </div>
            {selectionVisible && (
              <div
                className={`scheduling-assistant__selection${hasConflict ? " scheduling-assistant__selection--conflict" : uncertain ? " scheduling-assistant__selection--unknown" : ""}`}
                style={{
                  left:
                    220 + Math.max(0, ((selectionStart - window.start) / HALF_HOUR) * cellWidth),
                  width:
                    ((Math.min(selectionEnd, window.end) - Math.max(selectionStart, window.start)) /
                      HALF_HOUR) *
                    cellWidth,
                }}
              >
                <button
                  type="button"
                  className="scheduling-assistant__move"
                  aria-label={
                    overview
                      ? t("eventEditor.assistant.editDay", {
                          day: dayLabel(Math.max(start, window.start)),
                        })
                      : t("eventEditor.planner.move")
                  }
                  disabled={disabled || (!overview && (allDay || start < window.start))}
                  {...(!overview
                    ? pointerProps("move")
                    : { onClick: () => openDay(Math.max(start, window.start)) })}
                  title={`${time(start)} – ${time(end)}`}
                >
                  {time(start)} – {time(end)}
                </button>
                {!allDay && !overview && (
                  <>
                    {start >= window.start && (
                      <button
                        type="button"
                        className="scheduling-assistant__resize scheduling-assistant__resize--start"
                        disabled={disabled}
                        aria-label={t("eventEditor.planner.resizeStart")}
                        {...pointerProps("start")}
                      />
                    )}
                    {end <= window.end && (
                      <button
                        type="button"
                        className="scheduling-assistant__resize scheduling-assistant__resize--end"
                        disabled={disabled}
                        aria-label={t("eventEditor.planner.resizeEnd")}
                        {...pointerProps("end")}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="scheduling-assistant__footer">
        <div className="scheduling-assistant__legend">
          {(showDetails
            ? ["busy", "tentative", "oof", "unknown", "workingElsewhere"]
            : ["busy", "unknown"]
          ).map((status) => (
            <span key={status}>
              <i className={`scheduling-assistant__key scheduling-assistant__busy--${status}`} />
              {statusLabel(status)}
            </span>
          ))}
          <span>
            <i className="scheduling-assistant__key scheduling-assistant__nonworking" />
            {t("eventEditor.assistant.nonworking")}
          </span>
          {showSuggestions && (
            <span>
              <i className="scheduling-assistant__key scheduling-assistant__suggestion" />
              {t("eventEditor.assistant.suggested")}
            </span>
          )}
        </div>
        {showSuggestions && (
          <div className="scheduling-assistant__suggestion-navigation">
            <span role="status">
              {!canSuggest
                ? t("eventEditor.assistant.addParticipantsHint")
                : loading
                  ? t("eventEditor.planner.loading")
                  : suggestions.length
                    ? t("eventEditor.assistant.suggestionCount", { count: suggestions.length })
                    : t("eventEditor.assistant.noSuggestions")}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={t("eventEditor.assistant.previousSuggestion")}
              disabled={disabled || previousSuggestion === undefined}
              onClick={() => previousSuggestion !== undefined && select(previousSuggestion)}
            >
              <Chevron />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={t("eventEditor.assistant.nextSuggestion")}
              disabled={disabled || nextSuggestion === undefined}
              onClick={() => nextSuggestion !== undefined && select(nextSuggestion)}
            >
              <Chevron forward />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
