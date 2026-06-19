import { describe, expect, it } from "vitest";

import {
  isDeclinedEventResponse,
  isPendingEventResponse,
  normalizeEventResponseValue,
} from "../src/shared/event-response";

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
});
