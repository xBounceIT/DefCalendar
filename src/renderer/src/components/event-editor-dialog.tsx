import type {
  AttachmentDeleteArgs,
  AttachmentUploadArgs,
  CalendarEvent,
  CalendarSummary,
  EventAttachment,
  EventDraft,
  EventParticipant,
  EventResponseAction,
  Recurrence,
} from '@shared/schemas';
import React, { useEffect, useState } from 'react';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@shared/calendar';
import { useTranslation } from 'react-i18next';

import type { EditorState } from '../event-editor-state';
import { formatHeaderDate } from '../date-formatting';

interface EventEditorDialogProps {
  busy: boolean;
  calendars: CalendarSummary[];
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
  recurrenceRangeType: Recurrence['range']['type'];
  recurrenceType: Recurrence['pattern']['type'];
  reminderMinutesBeforeStart: string;
  responseComment: string;
  responseRequested: boolean;
  sensitivity: NonNullable<CalendarEvent['sensitivity']>;
  showAs: NonNullable<CalendarEvent['showAs']>;
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

  const attachmentSourceEvent = props.state?.mode === 'edit' ? props.state.event : null;

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
    void props.onListAttachments(event).then((items) => {
      if (!cancelled) {
        setAttachments(items);
        setAttachmentsBusy(false);
      }
    }).catch(() => {
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

  const editedEvent = props.state.mode === 'edit' ? props.state.event : null;
  const isEdit = Boolean(editedEvent);
  const readOnlyForAttendee = Boolean(editedEvent && !editedEvent.isOrganizer);

  return (
    <div className="slide-panel-backdrop">
      <button aria-label="Close" className="slide-panel-backdrop__dismiss" onClick={props.onDismiss} type="button" />
      <section aria-modal="true" className="slide-panel" role="dialog">
        <header className="slide-panel__header">
          <div>
            <p className="eyebrow">{isEdit ? t('eventEditor.editEventEyebrow') : t('eventEditor.newEventEyebrow')}</p>
            <h3>{isEdit ? t('eventEditor.editEventTitle') : t('eventEditor.newEventTitle')}</h3>
          </div>
          <button className="icon-button" onClick={props.onDismiss} type="button">
            {t('common.close')}
          </button>
        </header>

        <div className="slide-panel__body">
          {props.errorMessage && <div className="banner banner--error">{props.errorMessage}</div>}
          <EventMeta event={editedEvent} />

          <div className="slide-panel__section">
            <h4 className="slide-panel__section-title">{t('eventEditor.tabs.details')}</h4>
            <DetailsSection
              disabled={readOnlyForAttendee}
              form={form}
              onChange={setForm}
              calendars={props.calendars}
            />
          </div>

          <div className="slide-panel__section">
            <h4 className="slide-panel__section-title">{t('eventEditor.tabs.scheduling')}</h4>
            <SchedulingSection disabled={readOnlyForAttendee} form={form} onChange={setForm} />
          </div>

          <div className="slide-panel__section">
            <h4 className="slide-panel__section-title">{t('eventEditor.tabs.attendees')}</h4>
            <AttendeesSection
              attendees={form.attendees}
              disabled={readOnlyForAttendee}
              onChange={(attendees) => setForm((current) => (current ? { ...current, attendees } : current))}
            />
          </div>

          <div className="slide-panel__section">
            <h4 className="slide-panel__section-title">{t('eventEditor.tabs.teams')}</h4>
            <TeamsSection disabled={readOnlyForAttendee} event={editedEvent} form={form} onChange={setForm} />
          </div>

          <div className="slide-panel__section">
            <h4 className="slide-panel__section-title">{t('eventEditor.tabs.attachments')}</h4>
            <AttachmentsSection
              attachments={attachments}
              busy={attachmentsBusy || props.busy}
              event={editedEvent}
              onAddAttachment={async (file) => {
                if (!editedEvent) {
                  return;
                }
                setAttachmentsBusy(true);
                const uploaded = await props.onAddAttachment({
                  attachment: await readFileAsAttachment(file),
                  calendarId: editedEvent.calendarId,
                  eventId: editedEvent.id,
                });
                setAttachments(uploaded);
                setAttachmentsBusy(false);
              }}
              onRemoveAttachment={async (attachmentId) => {
                if (!editedEvent) {
                  return;
                }
                setAttachmentsBusy(true);
                const uploaded = await props.onRemoveAttachment({
                  attachmentId,
                  calendarId: editedEvent.calendarId,
                  eventId: editedEvent.id,
                });
                setAttachments(uploaded);
                setAttachmentsBusy(false);
              }}
            />
          </div>

          <div className="slide-panel__section">
            <h4 className="slide-panel__section-title">{t('eventEditor.tabs.responses')}</h4>
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
          </div>
        </div>

        <footer className="slide-panel__footer">
          <div className="slide-panel__footer-left">
            {editedEvent?.webLink && (
              <button
                className="ghost-button"
                onClick={() => {
                  void props.onOpenInOutlook(editedEvent.webLink!);
                }}
                type="button"
              >
                {t('eventEditor.openInOutlook')}
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
                {t('common.delete')}
              </button>
            )}
          </div>
          <div className="slide-panel__footer-right">
            <button className="ghost-button" onClick={props.onDismiss} type="button">
              {t('common.cancel')}
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
                {props.busy ? t('common.saving') : isEdit ? t('eventEditor.saveChanges') : t('eventEditor.createEvent')}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

function DetailsSection({
  calendars,
  disabled,
  form,
  onChange,
}: {
  calendars: CalendarSummary[];
  disabled: boolean;
  form: EditorFormState;
  onChange: React.Dispatch<React.SetStateAction<EditorFormState | null>>;
}) {
  const { t } = useTranslation();
  return (
    <div className="dialog-grid">
      <label className="field">
        <span>{t('eventEditor.calendar')}</span>
        <select
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { calendarId: event.target.value })}
          value={form.calendarId}
        >
          {calendars.map((calendar) => (
            <option key={calendar.id} value={calendar.id}>
              {calendar.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--full">
        <span>{t('eventEditor.subject')}</span>
        <input
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { subject: event.target.value })}
          type="text"
          value={form.subject}
        />
      </label>
      <label className="field">
        <span>{t('eventEditor.location')}</span>
        <input
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { location: event.target.value })}
          type="text"
          value={form.location}
        />
      </label>
      <label className="field">
        <span>{t('eventEditor.categories')}</span>
        <input
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { categories: event.target.value })}
          placeholder={t('eventEditor.categoriesPlaceholder')}
          type="text"
          value={form.categories}
        />
      </label>
      <label className="field">
        <span>{t('eventEditor.sensitivity')}</span>
        <select
          disabled={disabled}
          onChange={(event) =>
            updateForm(onChange, { sensitivity: event.target.value as EditorFormState['sensitivity'] })
          }
          value={form.sensitivity}
        >
          <option value="normal">{t('eventEditor.sensitivityNormal')}</option>
          <option value="personal">{t('eventEditor.sensitivityPersonal')}</option>
          <option value="private">{t('eventEditor.sensitivityPrivate')}</option>
          <option value="confidential">{t('eventEditor.sensitivityConfidential')}</option>
        </select>
      </label>
      <label className="field field--full">
        <span>{t('eventEditor.notes')}</span>
        <textarea
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { body: event.target.value })}
          rows={8}
          value={form.body}
        />
      </label>
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
  const { t } = useTranslation();
  const dateInputType = form.allDay ? 'date' : 'datetime-local';

  return (
    <div className="dialog-grid">
      <label className="checkbox-field">
        <input
          checked={form.allDay}
          disabled={disabled}
          onChange={(event) => updateForm(onChange, toggleAllDayForm(form, event.target.checked))}
          type="checkbox"
        />
        <span>{t('eventEditor.allDay')}</span>
      </label>
      <label className="field">
        <span>{form.allDay ? t('eventEditor.startDay') : t('eventEditor.start')}</span>
        <input
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { startInput: event.target.value })}
          type={dateInputType}
          value={form.startInput}
        />
      </label>
      <label className="field">
        <span>{form.allDay ? t('eventEditor.endDay') : t('eventEditor.end')}</span>
        <input
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { endInput: event.target.value })}
          type={dateInputType}
          value={form.endInput}
        />
      </label>
      <label className="checkbox-field">
        <input
          checked={form.isReminderOn}
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { isReminderOn: event.target.checked })}
          type="checkbox"
        />
        <span>{t('eventEditor.desktopReminder')}</span>
      </label>
      <label className="field">
        <span>{t('eventEditor.reminderMinutes')}</span>
        <input
          disabled={disabled || !form.isReminderOn}
          min="0"
          onChange={(event) => updateForm(onChange, { reminderMinutesBeforeStart: event.target.value })}
          step="5"
          type="number"
          value={form.reminderMinutesBeforeStart}
        />
      </label>
      <label className="field">
        <span>{t('eventEditor.showAs')}</span>
        <select
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { showAs: event.target.value as EditorFormState['showAs'] })}
          value={form.showAs}
        >
          <option value="busy">{t('eventEditor.showAsBusy')}</option>
          <option value="free">{t('eventEditor.showAsFree')}</option>
          <option value="tentative">{t('eventEditor.showAsTentative')}</option>
          <option value="oof">{t('eventEditor.showAsOof')}</option>
          <option value="workingElsewhere">{t('eventEditor.showAsWorkingElsewhere')}</option>
        </select>
      </label>
      <label className="checkbox-field">
        <input
          checked={form.allowNewTimeProposals}
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { allowNewTimeProposals: event.target.checked })}
          type="checkbox"
        />
        <span>{t('eventEditor.allowNewTimeProposals')}</span>
      </label>
      <label className="checkbox-field">
        <input
          checked={form.responseRequested}
          disabled={disabled}
          onChange={(event) => updateForm(onChange, { responseRequested: event.target.checked })}
          type="checkbox"
        />
        <span>{t('eventEditor.responseRequested')}</span>
      </label>
      <RecurrenceFields disabled={disabled} form={form} onChange={onChange} />
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
      <div className="event-meta">
        <span>{t('eventEditor.attendeeCount_other', { count: attendees.length })}</span>
      </div>
      {attendees.map((attendee, index) => (
        <div className="dialog-grid" key={`${attendee.email ?? 'attendee'}-${index}`}>
          <label className="field">
            <span>{t('eventEditor.attendeeName')}</span>
            <input
              disabled={disabled}
              onChange={(event) =>
                onChange(updateAttendee(attendees, index, { name: event.target.value || null }))
              }
              type="text"
              value={attendee.name ?? ''}
            />
          </label>
          <label className="field">
            <span>{t('eventEditor.attendeeEmail')}</span>
            <input
              disabled={disabled}
              onChange={(event) =>
                onChange(updateAttendee(attendees, index, { email: event.target.value || null }))
              }
              type="email"
              value={attendee.email ?? ''}
            />
          </label>
          <label className="field">
            <span>{t('eventEditor.attendeeType')}</span>
            <select
              disabled={disabled}
              onChange={(event) =>
                onChange(updateAttendee(attendees, index, { type: event.target.value as EventParticipant['type'] }))
              }
              value={attendee.type}
            >
              <option value="required">{t('eventEditor.attendeeTypeRequired')}</option>
              <option value="optional">{t('eventEditor.attendeeTypeOptional')}</option>
              <option value="resource">{t('eventEditor.attendeeTypeResource')}</option>
            </select>
          </label>
          <button
            className="ghost-button ghost-button--danger"
            disabled={disabled}
            onClick={() => onChange(attendees.filter((_, attendeeIndex) => attendeeIndex !== index))}
            type="button"
          >
            {t('eventEditor.removeAttendee')}
          </button>
        </div>
      ))}
      <button
        className="ghost-button"
        disabled={disabled}
        onClick={() =>
          onChange([...attendees, { email: null, name: null, response: null, status: null, type: 'required' }])
        }
        type="button"
      >
        {t('eventEditor.addAttendee')}
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
    <div className="dialog-grid">
      <label className="checkbox-field">
        <input
          checked={form.isOnlineMeeting}
          disabled={disabled}
          onChange={(eventValue) => updateForm(onChange, { isOnlineMeeting: eventValue.target.checked })}
          type="checkbox"
        />
        <span>{t('eventEditor.teamsMeeting')}</span>
      </label>
      <div className="event-meta">
        <span>{event?.onlineMeeting?.provider ?? t('eventEditor.noTeamsProvider')}</span>
        {event?.onlineMeeting?.joinUrl && <span>{event.onlineMeeting.joinUrl}</span>}
      </div>
    </div>
  );
}

function AttachmentsSection({
  attachments,
  busy,
  event,
  onAddAttachment,
  onRemoveAttachment,
}: {
  attachments: EventAttachment[];
  busy: boolean;
  event: CalendarEvent | null;
  onAddAttachment: (file: File) => Promise<void>;
  onRemoveAttachment: (attachmentId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="dialog-grid dialog-grid--single">
      {!event && <div className="banner banner--warning">{t('eventEditor.saveBeforeAttachments')}</div>}
      {attachments.map((attachment) => (
        <div className="event-meta" key={attachment.id}>
          <span>{attachment.name}</span>
          <span>{formatAttachmentSize(attachment.size)}</span>
          <button
            className="ghost-button ghost-button--danger"
            disabled={busy}
            onClick={() => {
              void onRemoveAttachment(attachment.id);
            }}
            type="button"
          >
            {t('eventEditor.removeAttachment')}
          </button>
        </div>
      ))}
      <label className="field">
        <span>{t('eventEditor.addFile')}</span>
        <input
          disabled={!event || busy}
          onChange={(inputEvent) => {
            const [file] = Array.from(inputEvent.target.files ?? []);
            if (file) {
              void onAddAttachment(file);
            }
            inputEvent.target.value = '';
          }}
          type="file"
        />
      </label>
    </div>
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
    return <div className="banner banner--warning">{t('eventEditor.responsesAfterCreate')}</div>;
  }

  return (
    <div className="dialog-grid dialog-grid--single">
      <div className="event-meta">
        <span>{event.isOrganizer ? t('eventEditor.organizerWorkflow') : t('eventEditor.attendeeWorkflow')}</span>
        {event.responseStatus?.response && <span>{t('eventEditor.yourResponse', { response: event.responseStatus.response })}</span>}
      </div>
      <label className="field field--full">
        <span>{t('eventEditor.comment')}</span>
        <textarea
          onChange={(eventValue) => onResponseCommentChange(eventValue.target.value)}
          rows={4}
          value={form.responseComment}
        />
      </label>
      {event.isOrganizer && event.attendees.length > 0 ? (
        <button
          className="ghost-button ghost-button--danger"
          disabled={busy}
          onClick={() => {
            void onCancelMeeting(event, form.responseComment);
          }}
          type="button"
        >
          {t('eventEditor.cancelMeeting')}
        </button>
      ) : (
        <div className="dialog-footer__left">
          {(['accept', 'tentative', 'decline'] as EventResponseAction[]).map((action) => (
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
        <span>{t('eventEditor.recurringEvent')}</span>
      </label>
      {form.recurrenceEnabled && (
        <>
          <label className="field">
            <span>{t('eventEditor.recurrencePattern')}</span>
            <select
              disabled={disabled}
              onChange={(event) =>
                updateForm(onChange, { recurrenceType: event.target.value as EditorFormState['recurrenceType'] })
              }
              value={form.recurrenceType}
            >
              <option value="daily">{t('eventEditor.recurrenceDaily')}</option>
              <option value="weekly">{t('eventEditor.recurrenceWeekly')}</option>
              <option value="absoluteMonthly">{t('eventEditor.recurrenceMonthly')}</option>
              <option value="absoluteYearly">{t('eventEditor.recurrenceYearly')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('eventEditor.recurrenceInterval')}</span>
            <input
              disabled={disabled}
              min="1"
              onChange={(event) => updateForm(onChange, { recurrenceInterval: event.target.value })}
              type="number"
              value={form.recurrenceInterval}
            />
          </label>
          <label className="field">
            <span>{t('eventEditor.recurrenceRange')}</span>
            <select
              disabled={disabled}
              onChange={(event) =>
                updateForm(onChange, { recurrenceRangeType: event.target.value as EditorFormState['recurrenceRangeType'] })
              }
              value={form.recurrenceRangeType}
            >
              <option value="noEnd">{t('eventEditor.recurrenceNoEnd')}</option>
              <option value="endDate">{t('eventEditor.recurrenceEndDate')}</option>
              <option value="numbered">{t('eventEditor.recurrenceOccurrences')}</option>
            </select>
          </label>
          {form.recurrenceType === 'weekly' && (
            <fieldset className="field field--full">
              <span>{t('eventEditor.recurrenceWeekdays')}</span>
              <div className="dialog-footer__left">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day) => (
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
          {(form.recurrenceType === 'absoluteMonthly' || form.recurrenceType === 'absoluteYearly') && (
            <label className="field">
              <span>{t('eventEditor.recurrenceDayOfMonth')}</span>
              <input
                disabled={disabled}
                max="31"
                min="1"
                onChange={(event) => updateForm(onChange, { recurrenceDayOfMonth: event.target.value })}
                type="number"
                value={form.recurrenceDayOfMonth}
              />
            </label>
          )}
          {form.recurrenceRangeType === 'endDate' && (
            <label className="field">
              <span>{t('eventEditor.recurrenceEndDate')}</span>
              <input
                disabled={disabled}
                onChange={(event) => updateForm(onChange, { recurrenceEndDate: event.target.value })}
                type="date"
                value={form.recurrenceEndDate}
              />
            </label>
          )}
          {form.recurrenceRangeType === 'numbered' && (
            <label className="field">
              <span>{t('eventEditor.recurrenceOccurrences')}</span>
              <input
                disabled={disabled}
                min="1"
                onChange={(event) => updateForm(onChange, { recurrenceOccurrences: event.target.value })}
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
      ? t('eventEditor.attendeeCount_other', { count: event.attendees.length })
      : null;

  return (
    <div className="event-meta">
      <span>{formatHeaderDate(event.start)}</span>
      <span>{event.isOrganizer ? t('eventEditor.organizerRole') : t('eventEditor.attendeeRole')}</span>
      {event.organizer?.email && <span>{event.organizer.email}</span>}
      {attendeeCount ? <span>{attendeeCount}</span> : null}
    </div>
  );
}

function buildFormState(state: EventEditorDialogProps['state']): EditorFormState | null {
  if (!state) {
    return null;
  }

  const event = state.mode === 'edit' ? state.event : null;
  const recurrence = event?.recurrence ?? null;
  const createAllDay = state.mode === 'create' ? state.allDay : event?.isAllDay ?? false;

  return {
    allDay: createAllDay,
    allowNewTimeProposals: event?.allowNewTimeProposals ?? true,
    attendees: event?.attendees ?? [],
    body: event?.body ?? '',
    calendarId: state.mode === 'create' ? state.calendarId : event!.calendarId,
    categories: (event?.categories ?? []).join(', '),
    endInput: buildEndInput(state),
    isOnlineMeeting: event?.isOnlineMeeting ?? false,
    isReminderOn: event?.isReminderOn ?? true,
    location: event?.location ?? '',
    recurrenceDayOfMonth: recurrence?.pattern.dayOfMonth?.toString() ?? '',
    recurrenceDaysOfWeek: recurrence?.pattern.daysOfWeek ?? [],
    recurrenceEnabled: Boolean(recurrence),
    recurrenceEndDate: recurrence?.range.endDate ?? '',
    recurrenceInterval: recurrence?.pattern.interval?.toString() ?? '1',
    recurrenceOccurrences: recurrence?.range.numberOfOccurrences?.toString() ?? '10',
    recurrenceRangeType: recurrence?.range.type ?? 'noEnd',
    recurrenceType: recurrence?.pattern.type ?? 'weekly',
    reminderMinutesBeforeStart: event?.reminderMinutesBeforeStart?.toString() ?? '15',
    responseComment: '',
    responseRequested: event?.responseRequested ?? true,
    sensitivity: event?.sensitivity ?? 'normal',
    showAs: event?.showAs ?? 'busy',
    startInput: toDateTimeInputValue(state.mode === 'create' ? state.start : event!.start, createAllDay),
    subject: event?.subject ?? '',
  };
}

function buildEndInput(state: EventEditorDialogProps['state']): string {
  if (!state) {
    return '';
  }

  if (state.mode === 'create') {
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
    bodyContentType: 'html',
    calendarId: form.calendarId,
    categories: form.categories.split(',').map((value) => value.trim()).filter(Boolean),
    end,
    etag: event?.etag ?? null,
    id: resolveEventId(event, form),
    isAllDay: form.allDay,
    isOnlineMeeting: form.isOnlineMeeting,
    isReminderOn: form.isReminderOn,
    location: form.location.trim() || null,
    recurrence: buildRecurrence(form, start),
    recurrenceEditScope: 'single',
    reminderMinutesBeforeStart: form.isReminderOn ? Number.parseInt(form.reminderMinutesBeforeStart, 10) || 15 : null,
    responseRequested: form.responseRequested,
    sensitivity: form.sensitivity,
    showAs: form.showAs,
    start,
    subject: form.subject.trim(),
    timeZone: event?.timeZone ?? (new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    webLink: event?.webLink ?? null,
  };
}

function buildRecurrence(form: EditorFormState, startIso: string): EventDraft['recurrence'] {
  if (!form.recurrenceEnabled) {
    return null;
  }

  return {
    pattern: {
      dayOfMonth: form.recurrenceDayOfMonth ? Number.parseInt(form.recurrenceDayOfMonth, 10) : null,
      daysOfWeek: form.recurrenceDaysOfWeek as Recurrence['pattern']['daysOfWeek'],
      firstDayOfWeek: 'monday',
      index: null,
      interval: Number.parseInt(form.recurrenceInterval, 10) || 1,
      month:
        form.recurrenceType === 'absoluteYearly'
          ? new Date(startIso).getUTCMonth() + 1
          : null,
      type: form.recurrenceType,
    },
    range: {
      endDate: form.recurrenceRangeType === 'endDate' ? form.recurrenceEndDate || null : null,
      numberOfOccurrences:
        form.recurrenceRangeType === 'numbered'
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
  t: ReturnType<typeof useTranslation>['t'],
  action: EventResponseAction,
): string {
  if (action === 'accept') {
    return t('eventEditor.responseActions.accept');
  }

  if (action === 'tentative') {
    return t('eventEditor.responseActions.tentative');
  }

  return t('eventEditor.responseActions.decline');
}

function readFileAsAttachment(file: File): Promise<AttachmentUploadArgs['attachment']> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read attachment.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read attachment.'));
        return;
      }

      const [, contentBytes = ''] = result.split(',');
      resolve({
        contentBytes,
        contentType: file.type || 'application/octet-stream',
        name: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

export default EventEditorDialog;
