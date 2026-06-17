import { describe, expect, it } from "vitest";

import { isDeclinedEventResponse, normalizeEventResponseValue } from "../src/shared/event-response";

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
});
