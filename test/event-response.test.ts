import { describe, expect, it } from "vitest";

import {
  isDeclinedEventResponse,
  isFuturePendingInvite,
  isPendingEventResponse,
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
    expect.assertions(5);

    expect(normalizeEventResponseValue("  TENTATIVELYACCEPTED  ")).toBe("tentative");
    expect(normalizeEventResponseValue("notResponded")).toBe("none");
    expect(normalizeEventResponseValue("organizer")).toBe("none");
    expect(normalizeEventResponseValue(" Declined ")).toBe("declined");
    expect(normalizeEventResponseValue("   ")).toBeNull();
  });

  it("detects declined responses after normalization", () => {
    expect.assertions(4);

    expect(isDeclinedEventResponse("declined")).toBe(true);
    expect(isDeclinedEventResponse(" DECLINED ")).toBe(true);
    expect(isDeclinedEventResponse("accepted")).toBe(false);
    expect(isDeclinedEventResponse(null)).toBe(false);
  });

  it("detects pending responses after normalization", () => {
    expect.assertions(5);

    expect(isPendingEventResponse(null)).toBe(true);
    expect(isPendingEventResponse("none")).toBe(true);
    expect(isPendingEventResponse(" notResponded ")).toBe(true);
    expect(isPendingEventResponse("accepted")).toBe(false);
    expect(isPendingEventResponse("declined")).toBe(false);
  });

  it("only treats unanswered future attendee events as pending invites", () => {
    expect.assertions(5);
    const now = new Date("2026-03-30T09:30:00.000Z").getTime();

    expect(isFuturePendingInvite(createInvite(), now)).toBe(true);
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
  });
});
