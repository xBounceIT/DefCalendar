import { describe, expect, it } from "vitest";

import {
  isDeclinedEventResponse,
  isFuturePendingInvite,
  normalizeEventResponseValue,
} from "../src/shared/event-response";
import type { CalendarEvent } from "../src/shared/schemas";

function createInvite(
  overrides: Partial<
    Pick<CalendarEvent, "cancelled" | "isOrganizer" | "responseStatus" | "start">
  > = {},
): Pick<CalendarEvent, "cancelled" | "isOrganizer" | "responseStatus" | "start"> {
  return {
    cancelled: false,
    isOrganizer: false,
    responseStatus: null,
    start: "2026-03-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("event response helpers", () => {
  it("normalizes response variants", () => {
    expect(normalizeEventResponseValue("tentative")).toBe("tentative");
    expect(normalizeEventResponseValue("  TENTATIVELYACCEPTED  ")).toBe("tentative");
    expect(normalizeEventResponseValue("none")).toBe("none");
    expect(normalizeEventResponseValue("notResponded")).toBe("none");
    expect(normalizeEventResponseValue("organizer")).toBe("none");
    expect(normalizeEventResponseValue("accepted")).toBe("accepted");
    expect(normalizeEventResponseValue(" Declined ")).toBe("declined");
    expect(normalizeEventResponseValue(null)).toBeNull();
    expect(normalizeEventResponseValue(undefined)).toBeNull();
    expect(normalizeEventResponseValue("   ")).toBeNull();
  });

  it("detects declined responses after normalization", () => {
    expect.assertions(4);

    expect(isDeclinedEventResponse("declined")).toBe(true);
    expect(isDeclinedEventResponse(" DECLINED ")).toBe(true);
    expect(isDeclinedEventResponse("accepted")).toBe(false);
    expect(isDeclinedEventResponse(null)).toBe(false);
  });

  it("only treats unanswered future attendee events as pending invites", () => {
    const now = new Date("2026-03-30T09:30:00.000Z").getTime();

    expect(isFuturePendingInvite(createInvite(), now)).toBe(true);
    expect(
      isFuturePendingInvite(
        createInvite({ responseStatus: { response: " notResponded ", time: null } }),
        now,
      ),
    ).toBe(true);
    expect(isFuturePendingInvite(createInvite({ start: "2026-03-30T09:00:00.000Z" }), now)).toBe(
      false,
    );
    expect(isFuturePendingInvite(createInvite({ start: "2026-03-30T09:30:00.000Z" }), now)).toBe(
      false,
    );
    expect(
      isFuturePendingInvite(
        createInvite({ responseStatus: { response: "accepted", time: null } }),
        now,
      ),
    ).toBe(false);
    expect(isFuturePendingInvite(createInvite({ isOrganizer: true }), now)).toBe(false);
    expect(isFuturePendingInvite(createInvite({ cancelled: true }), now)).toBe(false);
  });
});
