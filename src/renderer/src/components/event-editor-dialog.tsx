import type {
  AttachmentDeleteArgs,
  AttachmentUploadArgs,
  BodyContentType,
  CalendarEvent,
  CalendarSummary,
  EventAttachment,
  EventDraft,
  EventParticipant,
  EventResponseAction,
  Recurrence,
} from "@shared/schemas";
import React, { useEffect, useRef, useState } from "react";
import { fromDateTimeInputValue, toDateTimeInputValue } from "@shared/calendar";
import { useTranslation } from "react-i18next";

import type { EditorState } from "../event-editor-state";
import { formatHeaderDate } from "../date-formatting";
import teamsIcon from "../assets/teams.png";
import gmeetIcon from "../assets/gmeet.png";

interface EventEditorDialogProps {
  busy: boolean;
  calendars: CalendarSummary[];
  currentUser: EventParticipant | null;
  errorMessage: null | string;
  onAddAttachment: (args: AttachmentUploadArgs) => Promise<EventAttachment[]>;
  onCancelMeeting: (event: CalendarEvent, comment: string) => Promise<void>;
  onDelete: (event: CalendarEvent) => Promise<void>;
  onDismiss: () => void;
  onListAttachments: (event: CalendarEvent) => Promise<EventAttachment[]>;
  onOpenInOutlook: (url: string) => Promise<void>;
  onRemoveAttachment: (args: AttachmentDeleteArgs) => Promise<EventAttachment[]>;
  onRespond: (event: CalendarEvent, action: EventResponseAction, comment: string) => Promise<void>;
  onSave: (draft: EventDraft) => Promise<void>;
  state: EditorState | null;
}

interface EditorFormState {
  allDay: boolean;
  allowNewTimeProposals: boolean;
  attendees: EventParticipant[];
  body: string;
  bodyContentType: BodyContentType;
  calendarId: string;
  categories: string;
  endInput: string;
  isOnlineMeeting: boolean;
  isReminderOn: boolean;
  location: string;
  recurrenceDayOfMonth: string;
  recurrenceDaysOfWeek: string[];
  recurrenceEnabled: boolean;
  recurrenceEndDate: string;
  recurrenceInterval: string;
  recurrenceOccurrences: string;
  recurrenceRangeType: Recurrence["range"]["type"];
  recurrenceType: Recurrence["pattern"]["type"];
  reminderMinutesBeforeStart: string;
  responseComment: string;
  responseRequested: boolean;
  sensitivity: NonNullable<CalendarEvent["sensitivity"]>;
  showAs: NonNullable<CalendarEvent["showAs"]>;
  startInput: string;
  subject: string;
}

function EventEditorDialog(props: EventEditorDialogProps) {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState<EventAttachment[]>([]);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [form, setForm] = useState<EditorFormState | null>(null);

  useEffect(() => {
    setForm(buildFormState(props.state));
  }, [props.state]);

  const attachmentSourceEvent = props.state?.mode === "edit" ? props.state.event : null;

  useEffect(() => {
    const event = attachmentSourceEvent;
    if (!event) {
      setAttachments([]);
      return;
    }

    if (!event.hasAttachments && event.attachments.length === 0) {
      setAttachments([]);
      return;
    }

    let cancelled = false;
    setAttachmentsBusy(true);
    void props
      .onListAttachments(event)
      .then((items) => {
        if (!cancelled) {
          setAttachments(items);
          setAttachmentsBusy(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAttachments(event.attachments);
          setAttachmentsBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentSourceEvent, props.onListAttachments]);

  if (!props.state || !form) {
    return null;
  }

  const editedEvent = props.state.mode === "edit" ? props.state.event : null;
  const isEdit = Boolean(editedEvent);
  const readOnlyForAttendee = Boolean(editedEvent && !editedEvent.isOrganizer);

  return (
    <div className="slide-panel-backdrop">
      <button
        aria-label="Close"
        className="slide-panel-backdrop__dismiss"
        onClick={props.onDismiss}
        type="button"
      />
      <section aria-modal="true" className="slide-panel" role="dialog">
        <header className="slide-panel__header">
          <div className="slide-panel__header-title">
            <h3>{isEdit ? t("eventEditor.editEventTitle") : t("eventEditor.newEventTitle")}</h3>
          </div>
          <div className="slide-panel__header-actions">
            {editedEvent?.onlineMeeting?.joinUrl && (
              <button
                className="ghost-button"
                onClick={() => {
                  window.open(editedEvent.onlineMeeting!.joinUrl!, "_blank");
                }}
                type="button"
              >
                <MeetingIcon url={editedEvent.onlineMeeting!.joinUrl!} />
                <span>Partecipate</span>
              </button>
            )}
            {editedEvent && editedEvent.isOrganizer && editedEvent.attendees.length === 0 && (
              <button
                className="ghost-button ghost-button--danger"
                disabled={props.busy}
                onClick={() => {
                  void props.onDelete(editedEvent);
                }}
                type="button"
              >
                {t("common.delete")}
              </button>
            )}
            <button
              className="icon-button"
              onClick={props.onDismiss}
              type="button"
              aria-label={t("common.close")}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="slide-panel__body">
          {props.errorMessage && <div className="banner banner--error">{props.errorMessage}</div>}

          <div className="slide-panel__section">
            <div className="field-row">
              <CalendarSelectIcon />
              <select
                className="field-input field-input--underline field-select"
                disabled={readOnlyForAttendee}
                onChange={(event) => updateForm(setForm, { calendarId: event.target.value })}
                value={form.calendarId}
              >
                {props.calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                    {calendar.ownerAddress && ` (${calendar.ownerAddress})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <SubjectIcon />
              <input
                className="field-input field-input--underline"
                disabled={readOnlyForAttendee}
                onChange={(event) => updateForm(setForm, { subject: event.target.value })}
                placeholder={t("eventEditor.subject")}
                type="text"
                value={form.subject}
              />
            </div>

            <div className="field-row">
              <LocationIcon />
              <input
                className="field-input field-input--underline"
                disabled={readOnlyForAttendee}
                onChange={(event) => updateForm(setForm, { location: event.target.value })}
                placeholder={t("eventEditor.location")}
                type="text"
                value={form.location}
              />
            </div>
          </div>

          <div className="slide-panel__section">
            <div className="scheduling-teams-stack">
              <SchedulingSection disabled={readOnlyForAttendee} form={form} onChange={setForm} />
              {!editedEvent?.onlineMeeting?.joinUrl && (
                <TeamsSection
                  disabled={readOnlyForAttendee}
                  event={editedEvent}
                  form={form}
                  onChange={setForm}
                />
              )}
            </div>
          </div>

          <div className="slide-panel__section">
            <h4 className="slide-panel__section-title">{t("eventEditor.notes")}</h4>
            <NotesSection
              disabled={readOnlyForAttendee}
              form={form}
              onChange={setForm}
            />
          </div>

          {editedEvent && (
            <div className="slide-panel__section">
              <h4 className="slide-panel__section-title">{t("eventEditor.optionalResponses")}</h4>
              <CollapsibleSection title={t("eventEditor.optionalResponseActions")}>
                <ResponsesSection
                  busy={props.busy}
                  event={editedEvent}
                  form={form}
                  onCancelMeeting={props.onCancelMeeting}
                  onRespond={props.onRespond}
                  onResponseCommentChange={(responseComment) =>
                    setForm((current) => (current ? { ...current, responseComment } : current))
                  }
                />
              </CollapsibleSection>
            </div>
          )}
        </div>

        <aside className="slide-panel__sidebar">
          <AttendeesSidebar
            event={editedEvent}
            attendees={form.attendees}
            organizer={props.currentUser}
          />
        </aside>

        <footer className="slide-panel__footer">
          <div className="slide-panel__footer-left" />
          <div className="slide-panel__footer-right">
            <button className="ghost-button" onClick={props.onDismiss} type="button">
              {t("common.cancel")}
            </button>
            {!readOnlyForAttendee && (
              <button
                className="primary-button"
                disabled={props.busy || form.subject.trim().length === 0}
                onClick={() => {
                  void props.onSave(buildDraft(form, editedEvent));
                }}
                type="button"
              >
                {props.busy
                  ? t("common.saving")
                  : isEdit
                    ? t("eventEditor.saveChanges")
                    : t("eventEditor.createEvent")}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

function SchedulingSection({
  disabled,
  form,
  onChange,
}: {
  disabled: boolean;
  form: EditorFormState;
  onChange: React.Dispatch<React.SetStateAction<EditorFormState | null>>;
}) {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const summaryText = formatDateRangeSummary(
    form.startInput,
    form.endInput,
    form.allDay,
    i18n.language,
  );

  const extractDate = (input: string) => input.slice(0, 10);
  const extractTime = (input: string) => input.slice(11, 16);
  const combineDateTime = (date: string, time: string) => `${date}T${time}`;

  // Close popup when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    }

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded]);

  return (
    <div className="scheduling-section" ref={containerRef}>
      <div className="scheduling-row">
        <ClockIcon />
        <button
          type="button"
          className="scheduling-summary"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
        >
          <span className="scheduling-summary__text">{summaryText}</span>
          <ChevronDownIcon className={`scheduling-summary__arrow ${isExpanded ? "expanded" : ""}`} />
        </button>
      </div>

      {isExpanded && (
        <div className="scheduling-dropdown">
          <div className="scheduling-dropdown__row">
            <label className="field scheduling-field scheduling-field--date">
              <span>{t("eventEditor.startDate")}</span>
              <input
                disabled={disabled}
                onChange={(e) => {
                  const currentTime = extractTime(form.startInput) || "00:00";
                  onChange((current) =>
                    current
                      ? { ...current, startInput: combineDateTime(e.target.value, currentTime) }
                      : current,
                  );
                }}
                type="date"
                value={extractDate(form.startInput)}
              />
            </label>
            <label className="field scheduling-field scheduling-field--time">
              <span>{t("eventEditor.startTime")}</span>
              <input
                disabled={disabled || form.allDay}
                onChange={(e) => {
                  const currentDate = extractDate(form.startInput);
                  onChange((current) =>
                    current
                      ? { ...current, startInput: combineDateTime(currentDate, e.target.value) }
                      : current,
                  );
                }}
                type="time"
                value={extractTime(form.startInput)}
              />
            </label>
            <label className="field scheduling-field scheduling-field--time">
              <span>{t("eventEditor.endTime")}</span>
              <input
                disabled={disabled || form.allDay}
                onChange={(e) => {
                  const currentDate = extractDate(form.endInput);
                  onChange((current) =>
                    current
                      ? { ...current, endInput: combineDateTime(currentDate, e.target.value) }
                      : current,
                  );
                }}
                type="time"
                value={extractTime(form.endInput)}
              />
            </label>
          </div>

          <div className="scheduling-dropdown__options">
            <label className="checkbox-field scheduling-option">
              <input
                checked={form.allDay}
                disabled={disabled}
                onChange={(event) =>
                  updateForm(onChange, toggleAllDayForm(form, event.target.checked))
                }
                type="checkbox"
              />
              <span>{t("eventEditor.allDay")}</span>
            </label>
            <label className="checkbox-field scheduling-option">
              <input
                checked={form.recurrenceEnabled}
                disabled={disabled}
                onChange={(event) =>
                  updateForm(onChange, { recurrenceEnabled: event.target.checked })
                }
                type="checkbox"
              />
              <span>{t("eventEditor.recurringEvent")}</span>
            </label>
          </div>

          {form.recurrenceEnabled && (
            <div className="scheduling-dropdown__recurrence">
              <RecurrenceFields disabled={disabled} form={form} onChange={onChange} />
            </div>
          )}

          <CollapsibleSection title={t("eventEditor.optionalScheduling")}>
            <div className="dialog-grid dialog-grid--compact">
              <label className="checkbox-field">
                <input
                  checked={form.isReminderOn}
                  disabled={disabled}
                  onChange={(event) => updateForm(onChange, { isReminderOn: event.target.checked })}
                  type="checkbox"
                />
                <span>{t("eventEditor.desktopReminder")}</span>
              </label>
              <label className="field">
                <span>{t("eventEditor.reminderMinutes")}</span>
                <input
                  disabled={disabled || !form.isReminderOn}
                  min="0"
                  onChange={(event) =>
                    updateForm(onChange, { reminderMinutesBeforeStart: event.target.value })
                  }
                  step="5"
                  type="number"
                  value={form.reminderMinutesBeforeStart}
                />
              </label>
              <label className="field">
                <span>{t("eventEditor.showAs")}</span>
                <select
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(onChange, {
                      showAs: event.target.value as EditorFormState["showAs"],
                    })
                  }
                  value={form.showAs}
                >
                  <option value="busy">{t("eventEditor.showAsBusy")}</option>
                  <option value="free">{t("eventEditor.showAsFree")}</option>
                  <option value="tentative">{t("eventEditor.showAsTentative")}</option>
                  <option value="oof">{t("eventEditor.showAsOof")}</option>
                  <option value="workingElsewhere">
                    {t("eventEditor.showAsWorkingElsewhere")}
                  </option>
                </select>
              </label>
              <label className="checkbox-field">
                <input
                  checked={form.allowNewTimeProposals}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(onChange, { allowNewTimeProposals: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>{t("eventEditor.allowNewTimeProposals")}</span>
              </label>
              <label className="checkbox-field field--full">
                <input
                  checked={form.responseRequested}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(onChange, { responseRequested: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>{t("eventEditor.responseRequested")}</span>
              </label>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

function AttendeesSection({
  attendees,
  disabled,
  onChange,
}: {
  attendees: EventParticipant[];
  disabled: boolean;
  onChange: (attendees: EventParticipant[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="dialog-grid dialog-grid--single">
      {attendees.length > 0 && (
        <div className="attendee-row attendee-row--header">
          <span className="attendee-row__header-cell">{t("eventEditor.attendeeEmail")}</span>
          <span className="attendee-row__header-cell">{t("eventEditor.attendeeType")}</span>
          <span className="attendee-row__header-cell">{t("eventEditor.attendeeResponse")}</span>
          <span className="attendee-row__header-cell attendee-row__header-cell--action" />
        </div>
      )}
      {attendees.map((attendee, index) => (
        <div className="attendee-row" key={`${attendee.email ?? "attendee"}-${index}`}>
          <input
            className="attendee-row__email"
            disabled={disabled}
            onChange={(event) =>
              onChange(updateAttendee(attendees, index, { email: event.target.value || null }))
            }
            placeholder={t("eventEditor.attendeeEmail")}
            type="email"
            value={attendee.email ?? ""}
          />
          <select
            className="attendee-row__type"
            disabled={disabled}
            onChange={(event) =>
              onChange(
                updateAttendee(attendees, index, {
                  type: event.target.value as EventParticipant["type"],
                }),
              )
            }
            value={attendee.type}
          >
            <option value="required">{t("eventEditor.attendeeTypeRequired")}</option>
            <option value="optional">{t("eventEditor.attendeeTypeOptional")}</option>
          </select>
          <span className={`attendee-row__status ${getAttendeeResponseClass(attendee)}`}>
            {getAttendeeResponseLabel(t, attendee)}
          </span>
          <button
            className="icon-button icon-button--danger attendee-row__remove"
            disabled={disabled}
            onClick={() =>
              onChange(attendees.filter((_, attendeeIndex) => attendeeIndex !== index))
            }
            type="button"
            aria-label={t("eventEditor.removeAttendee")}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      <button
        className="ghost-button"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...attendees,
            { email: null, name: null, response: null, status: null, type: "required" },
          ])
        }
        type="button"
      >
        {t("eventEditor.addAttendee")}
      </button>
    </div>
  );
}

function TeamsSection({
  disabled,
  event,
  form,
  onChange,
}: {
  disabled: boolean;
  event: CalendarEvent | null;
  form: EditorFormState;
  onChange: React.Dispatch<React.SetStateAction<EditorFormState | null>>;
}) {
  const { t } = useTranslation();
  return (
    <div className="teams-section">
      <TeamsIcon />
      <label className="teams-toggle">
        <input
          checked={form.isOnlineMeeting}
          disabled={disabled}
          onChange={(eventValue) =>
            updateForm(onChange, { isOnlineMeeting: eventValue.target.checked })
          }
          type="checkbox"
        />
        <span className="toggle-slider" />
        <span className="teams-toggle__label">{t("eventEditor.teamsMeeting")}</span>
      </label>
    </div>
  );
}

function AttendeesSidebar({
  event,
  attendees,
  organizer,
}: {
  event: CalendarEvent | null;
  attendees: EventParticipant[];
  organizer: EventParticipant | null;
}) {
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    accepted: true,
    tentative: true,
    declined: false,
    pending: true,
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Group attendees by response status
  const groupedAttendees = {
    accepted: attendees.filter((a) => a.response === "accepted"),
    tentative: attendees.filter((a) => a.response === "tentative"),
    declined: attendees.filter((a) => a.response === "declined"),
    pending: attendees.filter((a) => !a.response || a.response === "none"),
  };

  const getGroupLabel = (group: string, count: number): string => {
    switch (group) {
      case "accepted": {
        return t("eventEditor.responseGroupAccepted", { count });
      }
      case "tentative": {
        return t("eventEditor.responseGroupTentative", { count });
      }
      case "declined": {
        return t("eventEditor.responseGroupDeclined", { count });
      }
      case "pending": {
        return t("eventEditor.responseGroupPending", { count });
      }
      default: {
        return "";
      }
    }
  };

  const getAttendeeAvatarClass = (response: string | null | undefined): string => {
    switch (response) {
      case "accepted": {
        return "attendees-sidebar__attendee-avatar--accepted";
      }
      case "declined": {
        return "attendees-sidebar__attendee-avatar--declined";
      }
      case "tentative": {
        return "attendees-sidebar__attendee-avatar--tentative";
      }
      default: {
        return "attendees-sidebar__attendee-avatar--pending";
      }
    }
  };

  const getInitials = (name: string | null, email: string | null): string => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "?";
  };

  const formatSentTime = (event: CalendarEvent | null): string => {
    if (!event?.created) {
      return "";
    }
    const date = new Date(event.created);
    return date.toLocaleString("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const displayOrganizer = event?.organizer ?? organizer;

  return (
    <div className="attendees-sidebar">
      {/* Organizer Section */}
      {displayOrganizer && (
        <div className="attendees-sidebar__section">
          <h4 className="attendees-sidebar__title">{t("eventEditor.organizerRole")}</h4>
          <div className="attendees-sidebar__organizer">
            <div className="attendees-sidebar__organizer-avatar">
              {getInitials(displayOrganizer.name, displayOrganizer.email)}
            </div>
            <div className="attendees-sidebar__organizer-info">
              <span className="attendees-sidebar__organizer-name">
                {displayOrganizer.name || displayOrganizer.email}
              </span>
              {event?.created && (
                <span className="attendees-sidebar__organizer-meta">
                  {t("eventEditor.invitationSent", { date: formatSentTime(event) })}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendees Section */}
      <div className="attendees-sidebar__section">
        <h4 className="attendees-sidebar__title">
          {t("eventEditor.tabs.attendees")}
          {attendees.length > 0 && <span className="attendee-count-badge">{attendees.length}</span>}
        </h4>

        {attendees.length === 0 ? (
          <div className="attendees-sidebar__empty">{t("eventEditor.noAttendees")}</div>
        ) : (
          <div className="attendees-sidebar__groups">
            {Object.entries(groupedAttendees).map(([group, groupAttendees]) => {
              if (groupAttendees.length === 0) {
                return null;
              }

              return (
                <div key={group} className="attendees-sidebar__group">
                  <div
                    className="attendees-sidebar__group-header"
                    onClick={() => toggleGroup(group)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        toggleGroup(group);
                      }
                    }}
                  >
                    <span
                      className={`attendees-sidebar__group-arrow ${expandedGroups[group] ? "expanded" : ""}`}
                    >
                      ▶
                    </span>
                    <span className="attendees-sidebar__group-title">
                      {getGroupLabel(group, groupAttendees.length)}
                    </span>
                    <span className="attendees-sidebar__group-count">{groupAttendees.length}</span>
                  </div>

                  {expandedGroups[group] && (
                    <div className="attendees-sidebar__group-list">
                      {groupAttendees.map((attendee, index) => (
                        <div
                          key={`${attendee.email ?? "attendee"}-${index}`}
                          className="attendees-sidebar__attendee"
                        >
                          <div
                            className={`attendees-sidebar__attendee-avatar ${getAttendeeAvatarClass(attendee.response)}`}
                          >
                            {getInitials(attendee.name, attendee.email)}
                          </div>
                          <div className="attendees-sidebar__attendee-info">
                            <span className="attendees-sidebar__attendee-name">
                              {attendee.name || attendee.email}
                            </span>
                            <span className="attendees-sidebar__attendee-type">
                              {attendee.type === "required"
                                ? t("eventEditor.attendeeTypeRequired")
                                : t("eventEditor.attendeeTypeOptional")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NotesSection({
  disabled,
  form,
  onChange,
}: {
  disabled: boolean;
  form: EditorFormState;
  onChange: React.Dispatch<React.SetStateAction<EditorFormState | null>>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const showFormattedPreview = form.bodyContentType === "html";

  return (
    <div className="dialog-grid dialog-grid--single notes-composer">
      <label className="field field--full">
        <div className="notes-textarea-wrapper">
          {showFormattedPreview ? (
            <div className="notes-html-view" role="document">
              <FormattedNotesBody html={form.body} />
            </div>
          ) : (
            <textarea
              disabled={disabled}
              onChange={(eventValue) =>
                updateForm(onChange, {
                  body: eventValue.target.value,
                  bodyContentType: "text",
                })
              }
              ref={textareaRef}
              rows={8}
              value={form.body}
            />
          )}
        </div>
      </label>
    </div>
  );
}

function FormattedNotesBody({ html }: { html: string }) {
  const renderedNodes = renderSafeHtmlNotes(html);
  if (renderedNodes.length === 0) {
    return null;
  }

  return <>{renderedNodes}</>;
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" width="20" height="20">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" width="20" height="20">
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
        ry="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <line
        x1="16"
        y1="2"
        x2="16"
        y2="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="2"
        x2="8"
        y2="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="3"
        y1="10"
        x2="21"
        y2="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MeetingIcon({ url }: { url: string }) {
  if (isGoogleMeetUrl(url)) {
    return <GMeetIcon />;
  }
  return <TeamsIcon />;
}

function TeamsIcon() {
  return (
    <img alt="" aria-hidden="true" src={teamsIcon} style={{ width: "16px", height: "16px" }} />
  );
}

function GMeetIcon() {
  return (
    <img alt="" aria-hidden="true" src={gmeetIcon} style={{ width: "16px", height: "16px" }} />
  );
}

function SubjectIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarSelectIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function isGoogleMeetUrl(url: string): boolean {
  return url.includes("meet.google.com");
}

function formatDateRangeSummary(
  startInput: string,
  endInput: string,
  allDay: boolean,
  locale: string,
): string {
  const startDate = new Date(startInput);
  const endDate = new Date(endInput);

  const dayNames: Record<string, string[]> = {
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    it: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
    es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
    fr: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
    de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  };

  const lang = locale.split("-")[0];
  const days = dayNames[lang] || dayNames["en"];

  const formatDate = (date: Date) => {
    const day = days[date.getDay()];
    const d = date.getDate().toString().padStart(2, "0");
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const y = date.getFullYear();
    return `${day} ${d}/${m}/${y}`;
  };

  const formatTime = (date: Date) => {
    const h = date.getHours().toString().padStart(2, "0");
    const min = date.getMinutes().toString().padStart(2, "0");
    return `${h}:${min}`;
  };

  if (allDay) {
    return `${formatDate(startDate)} (${locale.startsWith("it") ? "Giornata intera" : locale.startsWith("es") ? "Todo el día" : "All day"})`;
  }

  return `${formatDate(startDate)} ${formatTime(startDate)} - ${formatTime(endDate)}`;
}

function CollapsibleSection({
  children,
  defaultOpen = false,
  title,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  title: string;
}) {
  return (
    <details className="editor-collapsible" open={defaultOpen}>
      <summary className="editor-collapsible__summary">{title}</summary>
      <div className="editor-collapsible__content">{children}</div>
    </details>
  );
}

function ResponsesSection({
  busy,
  event,
  form,
  onCancelMeeting,
  onRespond,
  onResponseCommentChange,
}: {
  busy: boolean;
  event: CalendarEvent | null;
  form: EditorFormState;
  onCancelMeeting: (event: CalendarEvent, comment: string) => Promise<void>;
  onRespond: (event: CalendarEvent, action: EventResponseAction, comment: string) => Promise<void>;
  onResponseCommentChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  if (!event) {
    return <div className="banner banner--warning">{t("eventEditor.responsesAfterCreate")}</div>;
  }

  return (
    <div className="dialog-grid dialog-grid--single">
      <div className="event-meta">
        <span>
          {event.isOrganizer
            ? t("eventEditor.organizerWorkflow")
            : t("eventEditor.attendeeWorkflow")}
        </span>
        {event.responseStatus?.response && (
          <span>{t("eventEditor.yourResponse", { response: event.responseStatus.response })}</span>
        )}
      </div>
      <label className="field field--full">
        <span>{t("eventEditor.comment")}</span>
        <textarea
          onChange={(eventValue) => onResponseCommentChange(eventValue.target.value)}
          rows={4}
          value={form.responseComment}
        />
      </label>
      {event.isOrganizer ? (
        event.attendees.length > 0 ? (
          <button
            className="ghost-button ghost-button--danger"
            disabled={busy}
            onClick={() => {
              void onCancelMeeting(event, form.responseComment);
            }}
            type="button"
          >
            {t("eventEditor.cancelMeeting")}
          </button>
        ) : null
      ) : (
        <div className="dialog-footer__left">
          {(["accept", "tentative", "decline"] as EventResponseAction[]).map((action) => (
            <button
              key={action}
              className="ghost-button"
              disabled={busy}
              onClick={() => {
                void onRespond(event, action, form.responseComment);
              }}
              type="button"
            >
              {getResponseActionLabel(t, action)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecurrenceFields({
  disabled,
  form,
  onChange,
}: {
  disabled: boolean;
  form: EditorFormState;
  onChange: React.Dispatch<React.SetStateAction<EditorFormState | null>>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label className="checkbox-field">
        <input
          checked={form.recurrenceEnabled}
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { recurrenceEnabled: event.target.checked })}
          type="checkbox"
        />
        <span>{t("eventEditor.recurringEvent")}</span>
      </label>
      {form.recurrenceEnabled && (
        <>
          <label className="field">
            <span>{t("eventEditor.recurrencePattern")}</span>
            <select
              disabled={disabled}
              onChange={(event) =>
                updateForm(onChange, {
                  recurrenceType: event.target.value as EditorFormState["recurrenceType"],
                })
              }
              value={form.recurrenceType}
            >
              <option value="daily">{t("eventEditor.recurrenceDaily")}</option>
              <option value="weekly">{t("eventEditor.recurrenceWeekly")}</option>
              <option value="absoluteMonthly">{t("eventEditor.recurrenceMonthly")}</option>
              <option value="absoluteYearly">{t("eventEditor.recurrenceYearly")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("eventEditor.recurrenceInterval")}</span>
            <input
              disabled={disabled}
              min="1"
              onChange={(event) => updateForm(onChange, { recurrenceInterval: event.target.value })}
              type="number"
              value={form.recurrenceInterval}
            />
          </label>
          <label className="field">
            <span>{t("eventEditor.recurrenceRange")}</span>
            <select
              disabled={disabled}
              onChange={(event) =>
                updateForm(onChange, {
                  recurrenceRangeType: event.target.value as EditorFormState["recurrenceRangeType"],
                })
              }
              value={form.recurrenceRangeType}
            >
              <option value="noEnd">{t("eventEditor.recurrenceNoEnd")}</option>
              <option value="endDate">{t("eventEditor.recurrenceEndDate")}</option>
              <option value="numbered">{t("eventEditor.recurrenceOccurrences")}</option>
            </select>
          </label>
          {form.recurrenceType === "weekly" && (
            <fieldset className="field field--full">
              <span>{t("eventEditor.recurrenceWeekdays")}</span>
              <div className="dialog-footer__left">
                {["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => (
                  <label className="checkbox-field" key={day}>
                    <input
                      checked={form.recurrenceDaysOfWeek.includes(day)}
                      disabled={disabled}
                      onChange={() => updateRecurrenceDay(onChange, form, day)}
                      type="checkbox"
                    />
                    <span>{day.slice(0, 3)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {(form.recurrenceType === "absoluteMonthly" ||
            form.recurrenceType === "absoluteYearly") && (
            <label className="field">
              <span>{t("eventEditor.recurrenceDayOfMonth")}</span>
              <input
                disabled={disabled}
                max="31"
                min="1"
                onChange={(event) =>
                  updateForm(onChange, { recurrenceDayOfMonth: event.target.value })
                }
                type="number"
                value={form.recurrenceDayOfMonth}
              />
            </label>
          )}
          {form.recurrenceRangeType === "endDate" && (
            <label className="field">
              <span>{t("eventEditor.recurrenceEndDate")}</span>
              <input
                disabled={disabled}
                onChange={(event) =>
                  updateForm(onChange, { recurrenceEndDate: event.target.value })
                }
                type="date"
                value={form.recurrenceEndDate}
              />
            </label>
          )}
          {form.recurrenceRangeType === "numbered" && (
            <label className="field">
              <span>{t("eventEditor.recurrenceOccurrences")}</span>
              <input
                disabled={disabled}
                min="1"
                onChange={(event) =>
                  updateForm(onChange, { recurrenceOccurrences: event.target.value })
                }
                type="number"
                value={form.recurrenceOccurrences}
              />
            </label>
          )}
        </>
      )}
    </>
  );
}

function EventMeta({ event }: { event: CalendarEvent | null }) {
  const { t } = useTranslation();
  if (!event) {
    return null;
  }

  const attendeeCount =
    event.attendees.length > 0
      ? t("eventEditor.attendeeCount_other", { count: event.attendees.length })
      : null;

  return (
    <div className="event-meta">
      <span>{formatHeaderDate(event.start)}</span>
      <span>
        {event.isOrganizer ? t("eventEditor.organizerRole") : t("eventEditor.attendeeRole")}
      </span>
      {event.organizer?.email && <span>{event.organizer.email}</span>}
      {attendeeCount ? <span>{attendeeCount}</span> : null}
    </div>
  );
}

function buildFormState(state: EventEditorDialogProps["state"]): EditorFormState | null {
  if (!state) {
    return null;
  }

  const event = state.mode === "edit" ? state.event : null;
  const recurrence = event?.recurrence ?? null;
  const createAllDay = state.mode === "create" ? state.allDay : (event?.isAllDay ?? false);

  return {
    allDay: createAllDay,
    allowNewTimeProposals: event?.allowNewTimeProposals ?? true,
    attendees: event?.attendees ?? [],
    body: event?.body ?? "",
    bodyContentType: event?.bodyContentType ?? "text",
    calendarId: state.mode === "create" ? state.calendarId : event!.calendarId,
    categories: (event?.categories ?? []).join(", "),
    endInput: buildEndInput(state),
    isOnlineMeeting: event?.isOnlineMeeting ?? false,
    isReminderOn: event?.isReminderOn ?? true,
    location: event?.location ?? "",
    recurrenceDayOfMonth: recurrence?.pattern.dayOfMonth?.toString() ?? "",
    recurrenceDaysOfWeek: recurrence?.pattern.daysOfWeek ?? [],
    recurrenceEnabled: Boolean(recurrence),
    recurrenceEndDate: recurrence?.range.endDate ?? "",
    recurrenceInterval: recurrence?.pattern.interval?.toString() ?? "1",
    recurrenceOccurrences: recurrence?.range.numberOfOccurrences?.toString() ?? "10",
    recurrenceRangeType: recurrence?.range.type ?? "noEnd",
    recurrenceType: recurrence?.pattern.type ?? "weekly",
    reminderMinutesBeforeStart: event?.reminderMinutesBeforeStart?.toString() ?? "15",
    responseComment: "",
    responseRequested: event?.responseRequested ?? true,
    sensitivity: event?.sensitivity ?? "normal",
    showAs: event?.showAs ?? "busy",
    startInput: toDateTimeInputValue(
      state.mode === "create" ? state.start : event!.start,
      createAllDay,
    ),
    subject: event?.subject ?? "",
  };
}

function buildEndInput(state: EventEditorDialogProps["state"]): string {
  if (!state) {
    return "";
  }

  if (state.mode === "create") {
    if (state.allDay) {
      return toDateTimeInputValue(addDays(state.end, -1), true);
    }

    return toDateTimeInputValue(state.end, false);
  }

  if (state.event.isAllDay) {
    return toDateTimeInputValue(addDays(state.event.end, -1), true);
  }

  return toDateTimeInputValue(state.event.end, false);
}

function buildDraft(form: EditorFormState, event: CalendarEvent | null): EventDraft {
  const start = fromDateTimeInputValue(form.startInput, form.allDay);
  let end = fromDateTimeInputValue(form.endInput, false);
  if (form.allDay) {
    end = addDays(fromDateTimeInputValue(form.endInput, true), 1);
  }

  return {
    attachmentIdsToRemove: [],
    attachmentsToAdd: [],
    attendees: form.attendees,
    allowNewTimeProposals: form.allowNewTimeProposals,
    body: form.body.trim() || null,
    bodyContentType: form.bodyContentType,
    calendarId: form.calendarId,
    categories: form.categories
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    end,
    etag: event?.etag ?? null,
    id: resolveEventId(event, form),
    isAllDay: form.allDay,
    isOnlineMeeting: form.isOnlineMeeting,
    isReminderOn: form.isReminderOn,
    location: form.location.trim() || null,
    recurrence: buildRecurrence(form, start),
    recurrenceEditScope: "single",
    reminderMinutesBeforeStart: form.isReminderOn
      ? Number.parseInt(form.reminderMinutesBeforeStart, 10) || 15
      : null,
    responseRequested: form.responseRequested,
    sensitivity: form.sensitivity,
    showAs: form.showAs,
    start,
    subject: form.subject.trim(),
    timeZone: event?.timeZone ?? (new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    webLink: event?.webLink ?? null,
  };
}

function buildRecurrence(form: EditorFormState, startIso: string): EventDraft["recurrence"] {
  if (!form.recurrenceEnabled) {
    return null;
  }

  return {
    pattern: {
      dayOfMonth: form.recurrenceDayOfMonth ? Number.parseInt(form.recurrenceDayOfMonth, 10) : null,
      daysOfWeek: form.recurrenceDaysOfWeek as Recurrence["pattern"]["daysOfWeek"],
      firstDayOfWeek: "monday",
      index: null,
      interval: Number.parseInt(form.recurrenceInterval, 10) || 1,
      month: form.recurrenceType === "absoluteYearly" ? new Date(startIso).getUTCMonth() + 1 : null,
      type: form.recurrenceType,
    },
    range: {
      endDate: form.recurrenceRangeType === "endDate" ? form.recurrenceEndDate || null : null,
      numberOfOccurrences:
        form.recurrenceRangeType === "numbered"
          ? Number.parseInt(form.recurrenceOccurrences, 10) || 10
          : null,
      recurrenceTimeZone: null,
      startDate: startIso.slice(0, 10),
      type: form.recurrenceRangeType,
    },
  };
}

function resolveEventId(event: CalendarEvent | null, form: EditorFormState): string | undefined {
  if (!event) {
    return undefined;
  }

  if (event.recurrence && event.seriesMasterId && form.recurrenceEnabled) {
    return event.id;
  }

  return event.id;
}

function toggleAllDayForm(form: EditorFormState, nextAllDay: boolean): Partial<EditorFormState> {
  if (nextAllDay) {
    return {
      allDay: true,
      endInput: toDateTimeInputValue(fromDateTimeInputValue(form.endInput, false), true),
      startInput: toDateTimeInputValue(fromDateTimeInputValue(form.startInput, false), true),
    };
  }

  return {
    allDay: false,
    endInput: toDateTimeInputValue(addDays(fromDateTimeInputValue(form.endInput, true), 1), false),
    startInput: toDateTimeInputValue(fromDateTimeInputValue(form.startInput, true), false),
  };
}

function updateAttendee(
  attendees: EventParticipant[],
  index: number,
  patch: Partial<EventParticipant>,
): EventParticipant[] {
  return attendees.map((attendee, attendeeIndex) =>
    attendeeIndex === index ? { ...attendee, ...patch } : attendee,
  );
}

function updateForm(
  setForm: React.Dispatch<React.SetStateAction<EditorFormState | null>>,
  patch: Partial<EditorFormState>,
): void {
  setForm((current) => (current ? { ...current, ...patch } : current));
}

function updateRecurrenceDay(
  setForm: React.Dispatch<React.SetStateAction<EditorFormState | null>>,
  form: EditorFormState,
  day: string,
): void {
  const nextDays = form.recurrenceDaysOfWeek.includes(day)
    ? form.recurrenceDaysOfWeek.filter((currentDay) => currentDay !== day)
    : [...form.recurrenceDaysOfWeek, day];
  updateForm(setForm, { recurrenceDaysOfWeek: nextDays });
}

function addDays(value: string, days: number): string {
  return new Date(new Date(value).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  return `${Math.round((size / 1024) * 10) / 10} KB`;
}

function getResponseActionLabel(
  t: ReturnType<typeof useTranslation>["t"],
  action: EventResponseAction,
): string {
  if (action === "accept") {
    return t("eventEditor.responseActions.accept");
  }

  if (action === "tentative") {
    return t("eventEditor.responseActions.tentative");
  }

  return t("eventEditor.responseActions.decline");
}

function extractUrls(value: string): string[] {
  const matches = value.match(/(?:https?:\/\/|www\.)[^\s<>'"`]+/gi) ?? [];
  const unique: string[] = [];
  for (const match of matches) {
    const cleaned = match.replace(/[),.;!?]+$/, "");
    if (cleaned && !unique.includes(cleaned)) {
      unique.push(cleaned);
    }
  }
  return unique;
}

const BLOCKED_HTML_TAGS = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
]);

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function renderSafeHtmlNotes(value: string): (React.JSX.Element | string)[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  if (typeof DOMParser !== "function") {
    return [trimmedValue];
  }

  const parsed = new DOMParser().parseFromString(trimmedValue, "text/html");
  const rootNodes = [...parsed.body.childNodes];
  return rootNodes
    .map((node, index) => toSafeHtmlNode(node, `notes-${index}`))
    .filter((node): node is React.JSX.Element | string => node !== null);
}

function toSafeHtmlNode(node: Node, key: string): null | React.JSX.Element | string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (BLOCKED_HTML_TAGS.has(tag)) {
    return null;
  }

  const children = [...element.childNodes]
    .map((childNode, index) => toSafeHtmlNode(childNode, `${key}-${index}`))
    .filter((childNode): childNode is React.JSX.Element | string => childNode !== null);

  if (!ALLOWED_HTML_TAGS.has(tag)) {
    if (children.length === 0) {
      return null;
    }

    return <React.Fragment key={key}>{children}</React.Fragment>;
  }

  if (tag === "br" || tag === "hr") {
    return React.createElement(tag, { key });
  }

  if (tag === "a") {
    const href = sanitizeRenderedLink(element.getAttribute("href"));
    if (!href) {
      if (children.length === 0) {
        return null;
      }

      return <React.Fragment key={key}>{children}</React.Fragment>;
    }

    return (
      <a
        className="notes-html-link"
        href={href}
        key={key}
        rel="noreferrer noopener"
        target="_blank"
      >
        {children}
      </a>
    );
  }

  if (tag === "table") {
    return (
      <div className="notes-html-table-scroll" key={key}>
        <table>{children}</table>
      </div>
    );
  }

  return React.createElement(tag, { key }, children);
}

function sanitizeRenderedLink(value: null | string): null | string {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function convertHtmlBodyToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(value: string): string {
  if (typeof DOMParser !== "function") {
    return value
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  const parsed = new DOMParser().parseFromString(value, "text/html");
  return parsed.documentElement.textContent ?? "";
}

function normalizeUrl(value: string): null | string {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getAttendeeResponseLabel(
  t: ReturnType<typeof useTranslation>["t"],
  attendee: EventParticipant,
): string {
  const response = attendee.status?.response ?? attendee.response;
  if (!response) {
    return t("eventEditor.responseUnknown");
  }

  if (response === "accepted") {
    return t("eventEditor.responseAccepted");
  }

  if (response === "declined") {
    return t("eventEditor.responseDeclined");
  }

  if (response === "tentativelyAccepted") {
    return t("eventEditor.responseTentative");
  }

  return t("eventEditor.responseUnknown");
}

function getAttendeeResponseClass(attendee: EventParticipant): string {
  const response = attendee.status?.response ?? attendee.response;
  if (response === "accepted") {
    return "attendee-row__status--accepted";
  }
  if (response === "declined") {
    return "attendee-row__status--declined";
  }
  return "attendee-row__status--pending";
}

function readFileAsAttachment(file: File): Promise<AttachmentUploadArgs["attachment"]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read attachment."));
    reader.onload = () => {
      const { result } = reader;
      if (typeof result !== "string") {
        reject(new Error("Unable to read attachment."));
        return;
      }

      const [, contentBytes = ""] = result.split(",");
      resolve({
        contentBytes,
        contentType: file.type || "application/octet-stream",
        name: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

export default EventEditorDialog;
