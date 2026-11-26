import { describe, expect, it, vi } from "vitest";
import { openMeetingLink } from "../src/main/events/meeting-link";

describe("meeting links on macOS", () => {
  it.each([
    [
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc?context=%7B%7D",
      "msteams://teams.microsoft.com/l/meetup-join/19%3ameeting_abc?context=%7B%7D",
    ],
    [
      "https://teams.microsoft.com/meet/1234567890?p=abc",
      "msteams://teams.microsoft.com/meet/1234567890?p=abc",
    ],
    [
      "https://us06web.zoom.us/j/1234567890?pwd=abcdef",
      "zoommtg://zoom.us/join?action=join&confno=1234567890&pwd=abcdef",
    ],
    [
      "https://zoom.us/wc/1234567890/join?pwd=xyz",
      "zoommtg://zoom.us/join?action=join&confno=1234567890&pwd=xyz",
    ],
    ["https://zoom.us/j/1234567890", "zoommtg://zoom.us/join?action=join&confno=1234567890"],
    ["https://zoom.us/wc/join/1234567890", "zoommtg://zoom.us/join?action=join&confno=1234567890"],
  ])("opens %s in the native app with its meeting parameters", async (url, expected) => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    await openMeetingLink(url, openExternal, "darwin");
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it.each([
    "https://acme.webex.com/acme/j.php?MTID=m1234567890abcdef",
    "https://acme.webex.com/meet/jdoe",
    "https://acme.webex.com/join/1234567890",
    "https://meet.google.com/abc-defg-hij",
    "https://zoom.us/my/jdoe",
    "https://zoom.us/my/1234567890",
    "https://zoom.us/wc/settings/1234567890",
    "https://teams.microsoft.com/",
    "https://example.com/some/page",
    "http://teams.microsoft.com/l/meetup-join/abc",
  ])("opens %s directly without constructing a native meeting URL", async (url) => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    await openMeetingLink(url, openExternal, "darwin");
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
  });
});

it("opens Teams web links directly on Windows", async () => {
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const url = "https://teams.microsoft.com/l/meetup-join/example";
  await openMeetingLink(url, openExternal, "win32");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
});
