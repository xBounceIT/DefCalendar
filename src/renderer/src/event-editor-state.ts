import type {
  CalendarEvent,
  EventAttachment,
  EventDraft,
  EventResponseAction,
  RecurrenceEditScope,
} from "@shared/schemas";

interface CreateEditorState {
  attachmentMutations?: {
    attachments: EventAttachment[];
    pendingAddNames: string[];
    pendingRemoveIds: string[];
  };
  allDay: boolean;
  calendarId: string;
  draft?: Partial<EventDraft>;
  end: string;
  loadingDetails?: boolean;
  mode: "create";
  recurrenceEditScope?: RecurrenceEditScope;
  start: string;
}

interface EditEditorState {
  attachmentMutations?: {
    attachments: EventAttachment[];
    pendingAddNames: string[];
    pendingRemoveIds: string[];
  };
  draft?: Partial<EventDraft>;
  event: CalendarEvent;
  loadingDetails?: boolean;
  mode: "edit";
  recurrenceEditScope?: RecurrenceEditScope;
  responseAction?: EventResponseAction | null;
}

type EditorState = CreateEditorState | EditEditorState;

export { type EditorState };
