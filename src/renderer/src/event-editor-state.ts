import type { CalendarEvent } from '@shared/schemas';

interface CreateEditorState {
  allDay: boolean;
  calendarId: string;
  end: string;
  mode: 'create';
  start: string;
}

interface EditEditorState {
  event: CalendarEvent;
  mode: 'edit';
}

type EditorState = CreateEditorState | EditEditorState;

export { type EditorState };
