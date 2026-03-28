import { addMinutesToIso, fromDateTimeInputValue, isEventEditable, toDateTimeInputValue } from '../src/shared/calendar';
import { describe, expect, it } from 'vitest';

describe('calendar utilities', () => {
  it('round-trips timed datetime inputs', () => {
    const iso = '2026-03-27T09:15:00.000Z';
    const input = toDateTimeInputValue(iso, false);

    expect(input).toMatch(/2026-03-27T/);
    expect(fromDateTimeInputValue(input, false)).toBeTypeOf('string');
  });

  it('adds minutes to ISO strings', () => {
    expect(addMinutesToIso('2026-03-27T09:00:00.000Z', 30)).toBe('2026-03-27T09:30:00.000Z');
  });

  it('marks unsupported events as read-only', () => {
    expect({ editable: isEventEditable({ unsupportedReason: null }) }).toStrictEqual({ editable: true });
    expect({
      editable: isEventEditable({ unsupportedReason: 'Recurring events are view-only.' }),
    }).toStrictEqual({ editable: false });
  });
});
