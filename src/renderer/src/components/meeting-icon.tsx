import React from "react";

import gmeetIcon from "../assets/gmeet.png";
import teamsIcon from "../assets/teams.png";
import webexIcon from "../assets/webex.svg";
import zoomIcon from "../assets/zoom-meetings-icon.svg";

export function MeetingIcon({ url }: { url: string }) {
  if (isGoogleMeetUrl(url)) {
    return <GMeetIcon />;
  }

  if (isZoomUrl(url)) {
    return <ZoomIcon />;
  }

  if (isWebexUrl(url)) {
    return <WebexIcon />;
  }

  return <TeamsIcon />;
}

export function TeamsIcon() {
  return (
    <img alt="" aria-hidden="true" src={teamsIcon} style={{ width: "16px", height: "16px" }} />
  );
}

function GMeetIcon() {
  return (
    <img alt="" aria-hidden="true" src={gmeetIcon} style={{ width: "16px", height: "16px" }} />
  );
}

function ZoomIcon() {
  return <img alt="" aria-hidden="true" src={zoomIcon} style={{ width: "16px", height: "16px" }} />;
}

function WebexIcon() {
  return (
    <img alt="" aria-hidden="true" src={webexIcon} style={{ width: "16px", height: "16px" }} />
  );
}

function isGoogleMeetUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return Boolean(
    parsed &&
    (parsed.hostname === "meet.google.com" || parsed.hostname.endsWith(".meet.google.com")),
  );
}

function isZoomUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return Boolean(parsed && (parsed.hostname === "zoom.us" || parsed.hostname.endsWith(".zoom.us")));
}

function isWebexUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return Boolean(
    parsed && (parsed.hostname === "webex.com" || parsed.hostname.endsWith(".webex.com")),
  );
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
