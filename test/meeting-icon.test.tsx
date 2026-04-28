// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import gmeetIcon from "../src/renderer/src/assets/gmeet.png";
import teamsIcon from "../src/renderer/src/assets/teams.png";
import webexIcon from "../src/renderer/src/assets/webex.svg";
import zoomIcon from "../src/renderer/src/assets/zoom-meetings-icon.svg";
import { MeetingIcon } from "../src/renderer/src/components/meeting-icon";

afterEach(cleanup);

function renderIcon(url: string): HTMLImageElement {
  const { container } = render(<MeetingIcon url={url} />);
  const image = container.querySelector("img");
  if (!image) {
    throw new Error("Expected meeting icon image.");
  }
  return image;
}

describe("meeting icon", () => {
  it("uses the Zoom icon for Zoom links", () => {
    expect(renderIcon("https://acme.zoom.us/j/123456789").getAttribute("src")).toBe(zoomIcon);
  });

  it("uses the WebEx icon for WebEx links", () => {
    expect(renderIcon("https://example.webex.com/meet/team-room").getAttribute("src")).toBe(
      webexIcon,
    );
  });

  it("uses the Google Meet icon for Google Meet links", () => {
    expect(renderIcon("https://meet.google.com/abc-defg-hij").getAttribute("src")).toBe(gmeetIcon);
  });

  it("falls back to the Teams icon for unknown meeting links", () => {
    expect(
      renderIcon("https://teams.microsoft.com/l/meetup-join/example").getAttribute("src"),
    ).toBe(teamsIcon);
  });
});
