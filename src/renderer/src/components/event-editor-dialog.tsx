import type { CalendarEvent, CalendarSummary, EventDraft } from '@shared/schemas';
import React, { useEffect, useState } from 'react';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@shared/calendar';
import { useTranslation } from 'react-i18next';

import type { EditorState } from '../event-editor-state';
import { formatHeaderDate } from '../date-formatting';

interface EditorFormState {
  allDay: boolean;
  body: string;
  calendarId: string;
  endInput: string;
  isReminderOn: boolean;
  location: string;
  reminderMinutesBeforeStart: string;
  startInput: string;
  subject: string;
}

interface EventEditorDialogProps {
  busy: boolean;
  calendars: CalendarSummary[];
  errorMessage: null | string;
  onDelete: (event: CalendarEvent) => Promise<void>;
  onDismiss: () => void;
  onOpenInOutlook: (url: string) => Promise<void>;
  onSave: (draft: EventDraft) => Promise<void>;
  state: EditorState | null;
}

function CalendarOptions({ calendars }: { calendars: CalendarSummary[] }) {
  return (
    <>
      {calendars.map((calendar) => (
        <option key={calendar.id} value={calendar.id}>
          {calendar.name}
        </option>
      ))}
    </>
  );
}

function CheckboxField({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function CloseButton({ onDismiss }: Pick<EventEditorDialogProps, 'onDismiss'>) {
  return (
    <button className="icon-button" onClick={onDismiss} type="button">
      Close
    </button>
  );
}

function DateInputField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        type={getInputType(label)}
        value={value}
      />
    </label>
  );
}

function DeleteButton({
  busy,
  event,
  onDelete,
}: Pick<EventEditorDialogProps, 'busy' | 'onDelete'> & { event: CalendarEvent }) {
  return (
    <button
      className="ghost-button ghost-button--danger"
      disabled={busy}
      onClick={() => {
        void onDelete(event);
      }}
      type="button"
    >
      Delete
    </button>
  );
}

function DialogCard({
  busy,
  calendars,
  errorMessage,
  form,
  isEdit,
  onDelete,
  onDismiss,
  onOpenInOutlook,
  onSave,
  setForm,
  state,
  unsupportedReason,
}: EventEditorDialogProps & {
  form: EditorFormState;
  isEdit: boolean;
  setForm: React.Dispatch<React.SetStateAction<EditorFormState | null>>;
  unsupportedReason: null | string;
}) {
  const event = getEditedEvent(state);

  return (
    <section aria-modal="true" className="dialog-card" role="dialog">
      <DialogHeader isEdit={isEdit} onDismiss={onDismiss} />
      <DialogMessages errorMessage={errorMessage} unsupportedReason={unsupportedReason} />
      <DialogForm
        calendars={calendars}
        form={form}
        onAllDayChange={(checked) => {
          updateForm(setForm, (current) => toggleAllDay(current, checked));
        }}
        onBodyChange={(value) => {
          setFormField(setForm, 'body', value);
        }}
        onCalendarChange={(value) => {
          setFormField(setForm, 'calendarId', value);
        }}
        onEndChange={(value) => {
          setFormField(setForm, 'endInput', value);
        }}
        onLocationChange={(value) => {
          setFormField(setForm, 'location', value);
        }}
        onReminderChange={(checked) => {
          setFormField(setForm, 'isReminderOn', checked);
        }}
        onReminderMinutesChange={(value) => {
          setFormField(setForm, 'reminderMinutesBeforeStart', value);
        }}
        onStartChange={(value) => {
          setFormField(setForm, 'startInput', value);
        }}
        onSubjectChange={(value) => {
          setFormField(setForm, 'subject', value);
        }}
        unsupportedReason={unsupportedReason}
      />
      <EventMeta event={event} />
      <DialogFooter
        busy={busy}
        event={event}
        form={form}
        isEdit={isEdit}
        onDelete={onDelete}
        onDismiss={onDismiss}
        onOpenInOutlook={onOpenInOutlook}
        onSave={async () => {
          await onSave(buildDraft(form, event));
        }}
        unsupportedReason={unsupportedReason}
      />
    </section>
  );
}

function DialogDismissButton({ onDismiss }: Pick<EventEditorDialogProps, 'onDismiss'>) {
  const { t } = useTranslation();

  return (
    <button
      aria-label={t('common.close')}
      className="dialog-scrim__dismiss"
      onClick={onDismiss}
      type="button"
    />
  );
}

function DialogFooter({
  busy,
  event,
  form,
  isEdit,
  onDelete,
  onDismiss,
  onOpenInOutlook,
  onSave,
  unsupportedReason,
}: {
  busy: boolean;
  event: CalendarEvent | null;
  form: EditorFormState;
  isEdit: boolean;
  onDelete: (event: CalendarEvent) => Promise<void>;
  onDismiss: () => void;
  onOpenInOutlook: (url: string) => Promise<void>;
  onSave: () => Promise<void>;
  unsupportedReason: null | string;
}) {
  return (
    <footer className="dialog-footer">
      <FooterLeftActions
        busy={busy}
        event={event}
        onDelete={onDelete}
        onOpenInOutlook={onOpenInOutlook}
        unsupportedReason={unsupportedReason}
      />
      <FooterRightActions
        busy={busy}
        form={form}
        isEdit={isEdit}
        onDismiss={onDismiss}
        onSave={onSave}
        unsupportedReason={unsupportedReason}
      />
    </footer>
  );
}

function DialogForm({
  calendars,
  form,
  onAllDayChange,
  onBodyChange,
  onCalendarChange,
  onEndChange,
  onLocationChange,
  onReminderChange,
  onReminderMinutesChange,
  onStartChange,
  onSubjectChange,
  unsupportedReason,
}: {
  calendars: CalendarSummary[];
  form: EditorFormState;
  onAllDayChange: (checked: boolean) => void;
  onBodyChange: (value: string) => void;
  onCalendarChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onReminderChange: (checked: boolean) => void;
  onReminderMinutesChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  unsupportedReason: null | string;
}) {
  const fieldsDisabled = Boolean(unsupportedReason);

  return (
    <div className="dialog-grid">
      <SelectField
        calendars={calendars}
        disabled={fieldsDisabled}
        onChange={onCalendarChange}
        value={form.calendarId}
      />
      <TextInputField
        className="field field--full"
        disabled={fieldsDisabled}
        label="Subject"
        onChange={onSubjectChange}
        type="text"
        value={form.subject}
      />
      <DateInputField
        disabled={fieldsDisabled}
        label={getStartLabel(form.allDay)}
        onChange={onStartChange}
        value={form.startInput}
      />
      <DateInputField
        disabled={fieldsDisabled}
        label={getEndLabel(form.allDay)}
        onChange={onEndChange}
        value={form.endInput}
      />
      <CheckboxField
        checked={form.allDay}
        disabled={fieldsDisabled}
        label="All day"
        onChange={onAllDayChange}
      />
      <TextInputField
        disabled={fieldsDisabled}
        label="Location"
        onChange={onLocationChange}
        type="text"
        value={form.location}
      />
      <CheckboxField
        checked={form.isReminderOn}
        disabled={fieldsDisabled}
        label="Desktop reminder"
        onChange={onReminderChange}
      />
      <TextInputField
        disabled={fieldsDisabled || !form.isReminderOn}
        label="Reminder minutes"
        min="0"
        onChange={onReminderMinutesChange}
        step="5"
        type="number"
        value={form.reminderMinutesBeforeStart}
      />
      <TextareaField
        disabled={fieldsDisabled}
        label="Notes"
        onChange={onBodyChange}
        value={form.body}
      />
    </div>
  );
}

function DialogHeader({ isEdit, onDismiss }: { isEdit: boolean; onDismiss: () => void }) {
  return (
    <header className="dialog-header">
      <DialogTitleCopy isEdit={isEdit} />
      <CloseButton onDismiss={onDismiss} />
    </header>
  );
}

function DialogMessages({
  errorMessage,
  unsupportedReason,
}: Pick<EventEditorDialogProps, 'errorMessage'> & { unsupportedReason: null | string }) {
  let warningBanner: React.JSX.Element | null = null;
  if (unsupportedReason) {
    warningBanner = <div className="banner banner--warning">{unsupportedReason}</div>;
  }

  let errorBanner: React.JSX.Element | null = null;
  if (errorMessage) {
    errorBanner = <div className="banner banner--error">{errorMessage}</div>;
  }

  return (
    <>
      {warningBanner}
      {errorBanner}
    </>
  );
}

function DialogTitleCopy({ isEdit }: { isEdit: boolean }) {
  let eyebrow = 'New Exchange event';
  let title = 'Create event';
  if (isEdit) {
    eyebrow = 'Event details';
    title = 'Review or update event';
  }

  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
    </div>
  );
}

function EventEditorDialog(props: EventEditorDialogProps) {
  const [form, setForm] = useState<EditorFormState | null>(null);

  useEffect(() => {
    setForm(buildFormState(props.state));
  }, [props.state]);

  if (!props.state || !form) {
    return null;
  }

  const isEdit = props.state.mode === 'edit';
  const event = getEditedEvent(props.state);
  const unsupportedReason = event?.unsupportedReason ?? null;

  return (
    <div className="dialog-scrim">
      <DialogDismissButton onDismiss={props.onDismiss} />
      <DialogCard
        busy={props.busy}
        calendars={props.calendars}
        errorMessage={props.errorMessage}
        form={form}
        isEdit={isEdit}
        onDelete={props.onDelete}
        onDismiss={props.onDismiss}
        onOpenInOutlook={props.onOpenInOutlook}
        onSave={props.onSave}
        setForm={setForm}
        state={props.state}
        unsupportedReason={unsupportedReason}
      />
    </div>
  );
}

function EventMeta({ event }: { event: CalendarEvent | null }) {
  if (!event) {
    return null;
  }

  let organizerLabel = 'Owned by signed-in user';
  if (event.organizer?.email) {
    organizerLabel = `Organizer: ${event.organizer.email}`;
  }

  let attendeeCount: React.JSX.Element | null = null;
  if (event.attendees.length > 0) {
    attendeeCount = <span>{`${event.attendees.length} attendee(s)`}</span>;
  }

  return (
    <div className="event-meta">
      <span>{formatHeaderDate(event.start)}</span>
      <span>{organizerLabel}</span>
      {attendeeCount}
    </div>
  );
}

function FooterLeftActions({
  busy,
  event,
  onDelete,
  onOpenInOutlook,
  unsupportedReason,
}: {
  busy: boolean;
  event: CalendarEvent | null;
  onDelete: (event: CalendarEvent) => Promise<void>;
  onOpenInOutlook: (url: string) => Promise<void>;
  unsupportedReason: null | string;
}) {
  let openButton: React.JSX.Element | null = null;
  if (event?.webLink) {
    openButton = <OpenInOutlookButton onOpenInOutlook={onOpenInOutlook} url={event.webLink} />;
  }

  let deleteButton: React.JSX.Element | null = null;
  if (event && !unsupportedReason) {
    deleteButton = <DeleteButton busy={busy} event={event} onDelete={onDelete} />;
  }

  return (
    <div className="dialog-footer__left">
      {openButton}
      {deleteButton}
    </div>
  );
}

function FooterRightActions({
  busy,
  form,
  isEdit,
  onDismiss,
  onSave,
  unsupportedReason,
}: {
  busy: boolean;
  form: EditorFormState;
  isEdit: boolean;
  onDismiss: () => void;
  onSave: () => Promise<void>;
  unsupportedReason: null | string;
}) {
  let saveButton: React.JSX.Element | null = null;
  if (!unsupportedReason) {
    saveButton = (
      <SaveButton
        busy={busy}
        disabled={form.subject.trim().length === 0}
        isEdit={isEdit}
        onSave={onSave}
      />
    );
  }

  return (
    <div className="dialog-footer__right">
      <button className="ghost-button" onClick={onDismiss} type="button">
        Cancel
      </button>
      {saveButton}
    </div>
  );
}

function OpenInOutlookButton({
  onOpenInOutlook,
  url,
}: {
  onOpenInOutlook: (url: string) => Promise<void>;
  url: string;
}) {
  return (
    <button
      className="ghost-button"
      onClick={() => {
        void onOpenInOutlook(url);
      }}
      type="button"
    >
      Open in Outlook
    </button>
  );
}

function SaveButton({
  busy,
  disabled,
  isEdit,
  onSave,
}: {
  busy: boolean;
  disabled: boolean;
  isEdit: boolean;
  onSave: () => Promise<void>;
}) {
  let label = 'Create Event';
  if (busy) {
    label = 'Saving…';
  } else if (isEdit) {
    label = 'Save Changes';
  }

  return (
    <button
      className="primary-button"
      disabled={busy || disabled}
      onClick={() => {
        void onSave();
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function SelectField({
  calendars,
  disabled,
  onChange,
  value,
}: {
  calendars: CalendarSummary[];
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="field">
      <span>Calendar</span>
      <select
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        <CalendarOptions calendars={calendars} />
      </select>
    </label>
  );
}

function TextareaField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="field field--full">
      <span>{label}</span>
      <textarea
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        rows={5}
        value={value}
      />
    </label>
  );
}

function TextInputField({
  className = 'field',
  disabled,
  label,
  min,
  onChange,
  step,
  type,
  value,
}: {
  className?: string;
  disabled: boolean;
  label: string;
  min?: string;
  onChange: (value: string) => void;
  step?: string;
  type: 'number' | 'text';
  value: string;
}) {
  return (
    <label className={className}>
      <span>{label}</span>
      <input
        disabled={disabled}
        min={min}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        step={step}
        type={type}
        value={value}
      />
    </label>
  );
}

function addDays(value: string, days: number): string {
  return new Date(new Date(value).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildCreateFormState(state: Extract<EditorState, { mode: 'create' }>): EditorFormState {
  let endInput = toDateTimeInputValue(state.end, false);
  if (state.allDay) {
    endInput = toDateTimeInputValue(addDays(state.end, -1), true);
  }

  return {
    allDay: state.allDay,
    body: '',
    calendarId: state.calendarId,
    endInput,
    isReminderOn: true,
    location: '',
    reminderMinutesBeforeStart: '15',
    startInput: toDateTimeInputValue(state.start, state.allDay),
    subject: '',
  };
}

function buildDraft(form: EditorFormState, event: CalendarEvent | null): EventDraft {
  const start = fromDateTimeInputValue(form.startInput, form.allDay);
  let end = fromDateTimeInputValue(form.endInput, false);
  if (form.allDay) {
    end = addDays(fromDateTimeInputValue(form.endInput, true), 1);
  }

  const trimmedBody = form.body.trim();
  const trimmedLocation = form.location.trim();
  let reminderMinutesBeforeStart: null | number = null;
  if (form.isReminderOn) {
    reminderMinutesBeforeStart = Number.parseInt(form.reminderMinutesBeforeStart, 10) || 15;
  }

  return {
    body: trimmedBody || null,
    calendarId: form.calendarId,
    etag: event?.etag ?? null,
    id: event?.id,
    isAllDay: form.allDay,
    isReminderOn: form.isReminderOn,
    location: trimmedLocation || null,
    reminderMinutesBeforeStart,
    start,
    subject: form.subject.trim(),
    timeZone: resolveTimeZone(event),
    webLink: event?.webLink ?? null,
    end,
  };
}

function buildEditFormState(state: Extract<EditorState, { mode: 'edit' }>): EditorFormState {
  let endInput = toDateTimeInputValue(state.event.end, false);
  if (state.event.isAllDay) {
    endInput = toDateTimeInputValue(addDays(state.event.end, -1), true);
  }

  return {
    allDay: state.event.isAllDay,
    body: state.event.body ?? '',
    calendarId: state.event.calendarId,
    endInput,
    isReminderOn: state.event.isReminderOn,
    location: state.event.location ?? '',
    reminderMinutesBeforeStart: state.event.reminderMinutesBeforeStart?.toString() ?? '15',
    startInput: toDateTimeInputValue(state.event.start, state.event.isAllDay),
    subject: state.event.subject,
  };
}

function buildFormState(state: EventEditorDialogProps['state']): EditorFormState | null {
  if (!state) {
    return null;
  }

  if (state.mode === 'edit') {
    return buildEditFormState(state);
  }

  return buildCreateFormState(state);
}

function getEditedEvent(state: EventEditorDialogProps['state']): CalendarEvent | null {
  if (state?.mode === 'edit') {
    return state.event;
  }

  return null;
}

function getEndLabel(allDay: boolean): string {
  if (allDay) {
    return 'End day';
  }

  return 'End';
}

function getInputType(label: string): 'date' | 'datetime-local' {
  if (label === 'Start' || label === 'End') {
    return 'datetime-local';
  }

  return 'date';
}

function getStartLabel(allDay: boolean): string {
  if (allDay) {
    return 'Start day';
  }

  return 'Start';
}

function resolveTimeZone(event: CalendarEvent | null): string {
  if (event?.timeZone) {
    return event.timeZone;
  }

  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function setFormField<Key extends keyof EditorFormState>(
  setForm: React.Dispatch<React.SetStateAction<EditorFormState | null>>,
  field: Key,
  value: EditorFormState[Key],
): void {
  updateForm(setForm, (current) => ({
    ...current,
    [field]: value,
  }));
}

function toggleAllDay(current: EditorFormState, nextAllDay: boolean): EditorFormState {
  if (nextAllDay) {
    return {
      ...current,
      allDay: true,
      endInput: toDateTimeInputValue(fromDateTimeInputValue(current.endInput, false), true),
      startInput: toDateTimeInputValue(fromDateTimeInputValue(current.startInput, false), true),
    };
  }

  return {
    ...current,
    allDay: false,
    endInput: toDateTimeInputValue(addDays(fromDateTimeInputValue(current.endInput, true), 1), false),
    startInput: toDateTimeInputValue(fromDateTimeInputValue(current.startInput, true), false),
  };
}

function updateForm(
  setForm: React.Dispatch<React.SetStateAction<EditorFormState | null>>,
  update: (current: EditorFormState) => EditorFormState,
): void {
  setForm((current) => {
    if (!current) {
      return current;
    }

    return update(current);
  });
}

export default EventEditorDialog;
