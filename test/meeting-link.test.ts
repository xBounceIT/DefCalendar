import { describe, expect, it, vi } from "vitest";

import { openMeetingLink, toNativeMeetingUrl } from "../src/main/events/meeting-link";

describe("toNativeMeetingUrl", () => {
  it("maps Teams meeting links to the msteams scheme", () => {
    const url = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc?context=%7B%7D";
    expect(toNativeMeetingUrl(url)).toBe(
      "msteams://teams.microsoft.com/l/meetup-join/19%3ameeting_abc?context=%7B%7D",
    );
  });

  it("maps Zoom meeting links to the zoommtg scheme", () => {
    const url = "https://us06web.zoom.us/j/1234567890?pwd=abcdef";
    expect(toNativeMeetingUrl(url)).toBe("zoommtg://us06web.zoom.us/j/1234567890?pwd=abcdef");
  });

  it("maps Webex meeting links to the wbx scheme", () => {
    const url = "https://acme.webex.com/acme/j.php?MTID=m1234567890abcdef";
    expect(toNativeMeetingUrl(url)).toBe(
      "wbx://acme.webex.com/acme/j.php?MTID=m1234567890abcdef",
    );
  });

  it("maps Webex join paths to the wbx scheme", () => {
    expect(toNativeMeetingUrl("https://acme.webex.com/meet/jdoe")).toBe(
      "wbx://acme.webex.com/meet/jdoe",
    );
    expect(toNativeMeetingUrl("https://acme.webex.com/join/1234567890")).toBe(
      "wbx://acme.webex.com/join/1234567890",
    );
  });

  it("returns null for providers without a desktop app", () => {
    expect(toNativeMeetingUrl("https://meet.google.com/abc-defg-hij")).toBeNull();
  });

  it("returns null for non-meeting links", () => {
    expect(toNativeMeetingUrl("https://example.com/some/page")).toBeNull();
    expect(toNativeMeetingUrl("https://teams.microsoft.com/")).toBeNull();
  });

  it("returns null for non-https and invalid URLs", () => {
    expect(toNativeMeetingUrl("http://teams.microsoft.com/l/meetup-join/abc")).toBeNull();
    expect(toNativeMeetingUrl("msteams://teams.microsoft.com/l/meetup-join/abc")).toBeNull();
    expect(toNativeMeetingUrl("not a url")).toBeNull();
  });
});

describe("openMeetingLink", () => {
  it("opens only the native app on macOS when it handles the link", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const url = "https://teams.microsoft.com/l/meetup-join/example";

    await openMeetingLink(url, openExternal, "darwin");

    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(
      "msteams://teams.microsoft.com/l/meetup-join/example",
    );
  });

  it("falls back to the browser on macOS when the native app is unavailable", async () => {
    const openExternal = vi
      .fn()
      .mockRejectedValueOnce(new Error("no handler"))
      .mockResolvedValue(undefined);
    const url = "https://us02web.zoom.us/j/1234567890?pwd=abc";

    await openMeetingLink(url, openExternal, "darwin");

    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(openExternal).toHaveBeenNthCalledWith(
      1,
      "zoommtg://us02web.zoom.us/j/1234567890?pwd=abc",
    );
    expect(openExternal).toHaveBeenNthCalledWith(2, url);
  });

  it("opens the web link directly on macOS for providers without a desktop app", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const url = "https://meet.google.com/abc-defg-hij";

    await openMeetingLink(url, openExternal, "darwin");

    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(url);
  });

  it("opens the web link directly outside macOS", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const url = "https://teams.microsoft.com/l/meetup-join/example";

    await openMeetingLink(url, openExternal, "win32");
    await openMeetingLink(url, openExternal, "linux");

    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(openExternal).toHaveBeenNthCalledWith(1, url);
    expect(openExternal).toHaveBeenNthCalledWith(2, url);
  });
});
