import React from "react";

import teamsIcon from "../assets/teams.png";
import gmeetIcon from "../assets/gmeet.png";

export function MeetingIcon({ url }: { url: string }) {
  if (isGoogleMeetUrl(url)) {
    return <GMeetIcon />;
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

function isGoogleMeetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "meet.google.com" || parsed.hostname.endsWith(".meet.google.com");
  } catch {
    return false;
  }
}
